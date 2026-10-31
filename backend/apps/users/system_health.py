"""Live host, database, and application figures for the superadmin console."""

import logging
import os
import platform
import shutil
import socket
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.integrations.models import (
    Assessment,
    AuditLog,
    Course,
    Institution,
    SystemMetricSample,
    UserProfile,
    UserRole,
)

logger = logging.getLogger(__name__)

SAMPLE_LOCK = 'sysmetric:lock'
SAMPLE_LOCK_SECONDS = 60
BACKEND_LATENCY_KEY = 'platform:backend-latency'

try:
    import psutil
except ImportError:
    psutil = None
else:
    try:
        psutil.cpu_percent(interval=None)
    except Exception:
        logger.debug('CPU baseline could not be primed', exc_info=True)


def _format_bytes(size):
    if size is None:
        return None
    value = float(size)
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if value < 1024 or unit == 'TB':
            if unit == 'B':
                return f'{int(value)} B'
            return f'{value:.1f} {unit}'
        value /= 1024
    return None


def _format_duration(seconds):
    seconds = max(int(seconds or 0), 0)
    days, remainder = divmod(seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, _secs = divmod(remainder, 60)
    if days:
        return f'{days}d {hours}h'
    if hours:
        return f'{hours}h {minutes}m'
    return f'{minutes}m'


def _status_for_percent(percent, warn_at, critical_at):
    if percent is None:
        return 'unknown'
    if percent >= critical_at:
        return 'critical'
    if percent >= warn_at:
        return 'warning'
    return 'healthy'


def _disk_path():
    base = Path(getattr(settings, 'BASE_DIR', '/'))
    anchor = base.anchor or '/'
    return str(anchor)


def _load_average():
    try:
        one, five, fifteen = os.getloadavg()
    except (AttributeError, OSError):
        if psutil is None:
            return None
        try:
            one, five, fifteen = psutil.getloadavg()
        except (AttributeError, OSError):
            return None
    return {
        '1': round(one, 2),
        '5': round(five, 2),
        '15': round(fifteen, 2),
    }


def _cpu(measure):
    count = os.cpu_count() or 0
    if psutil is None:
        return {'available': False, 'percent': None, 'count': count}
    try:
        percent = psutil.cpu_percent(interval=0.15 if measure else None)
    except Exception:
        logger.debug('CPU percent failed', exc_info=True)
        return {'available': False, 'percent': None, 'count': count}
    return {
        'available': True,
        'percent': round(float(percent), 1),
        'count': count,
    }


def _memory():
    if psutil is None:
        return {'available': False, 'percent': None, 'total': None, 'used': None, 'total_label': None, 'used_label': None}
    vm = psutil.virtual_memory()
    return {
        'available': True,
        'percent': round(float(vm.percent), 1),
        'total': int(vm.total),
        'used': int(vm.used),
        'total_label': _format_bytes(vm.total),
        'used_label': _format_bytes(vm.used),
    }


def _directory_size(path):
    total = 0
    seen = 0
    capped = False
    for root, _dirs, files in os.walk(path):
        for name in files:
            seen += 1
            if seen > 5000:
                capped = True
                return total, capped
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                continue
    return total, capped


def _media_storage():
    root = getattr(settings, 'MEDIA_ROOT', None)
    path = str(root or '')
    if not path or not os.path.isdir(path):
        return {'bytes': 0, 'size_label': '0 B', 'path': path, 'capped': False}
    size, capped = _directory_size(path)
    return {
        'bytes': size,
        'size_label': _format_bytes(size),
        'path': path,
        'capped': capped,
    }


def _mounts():
    if psutil is None:
        return []
    rows = []
    seen = set()
    try:
        partitions = psutil.disk_partitions(all=False)
    except Exception:
        return []
    for part in partitions:
        mount = part.mountpoint
        if mount in seen or part.fstype in {'squashfs', 'tmpfs', 'devtmpfs', 'devfs'}:
            continue
        seen.add(mount)
        try:
            usage = psutil.disk_usage(mount)
        except OSError:
            continue
        percent = round((usage.used / usage.total) * 100, 1) if usage.total else 0
        rows.append({
            'mount': mount,
            'fstype': part.fstype,
            'percent': percent,
            'total_label': _format_bytes(usage.total),
            'used_label': _format_bytes(usage.used),
            'free_label': _format_bytes(usage.free),
        })
    return rows


def _disk(detailed=False):
    path = _disk_path()
    media = _media_storage() if detailed else {'bytes': None, 'size_label': None, 'path': '', 'capped': False}
    mounts = _mounts() if detailed else []
    try:
        usage = shutil.disk_usage(path)
    except OSError:
        return {
            'available': False,
            'path': path,
            'percent': None,
            'total': None,
            'used': None,
            'free': None,
            'total_label': None,
            'used_label': None,
            'free_label': None,
            'media': media,
            'mounts': mounts,
        }
    percent = round((usage.used / usage.total) * 100, 1) if usage.total else 0
    return {
        'available': True,
        'path': path,
        'percent': percent,
        'total': int(usage.total),
        'used': int(usage.used),
        'free': int(usage.free),
        'total_label': _format_bytes(usage.total),
        'used_label': _format_bytes(usage.used),
        'free_label': _format_bytes(usage.free),
        'media': media,
        'mounts': mounts,
    }


def _uptime():
    if psutil is None:
        return {'seconds': None, 'label': None, 'booted_at': None}
    boot = psutil.boot_time()
    seconds = max(time.time() - boot, 0)
    booted = datetime.fromtimestamp(boot, tz=timezone.get_current_timezone())
    return {
        'seconds': int(seconds),
        'label': _format_duration(seconds),
        'booted_at': booted.isoformat(),
    }


def _database_tables(cursor, total):
    cursor.execute(
        """
        SELECT c.relname, pg_total_relation_size(c.oid)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 8
        """
    )
    tables = []
    for name, size in cursor.fetchall():
        size = int(size or 0)
        tables.append({
            'name': name,
            'bytes': size,
            'size_label': _format_bytes(size),
            'share': round((size / total) * 100, 1) if total else 0,
        })
    return tables


def _database():
    started = time.perf_counter()
    tables = []
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
            latency_ms = round((time.perf_counter() - started) * 1000, 1)
            size = None
            if connection.vendor == 'postgresql':
                cursor.execute('SELECT pg_database_size(current_database())')
                size = int(cursor.fetchone()[0] or 0)
                try:
                    tables = _database_tables(cursor, size)
                except Exception:
                    logger.debug('Database table sizes could not be read', exc_info=True)
                    tables = []
    except Exception as exc:
        logger.warning('Database health check failed', exc_info=True)
        return {
            'ok': False,
            'vendor': connection.vendor,
            'name': None,
            'latency_ms': None,
            'size': None,
            'size_label': None,
            'tables': [],
            'detail': 'Database did not respond.',
            'error': str(exc.__class__.__name__),
        }

    name = connection.settings_dict.get('NAME')
    if connection.vendor == 'sqlite' and name:
        try:
            size = os.path.getsize(name)
        except OSError:
            size = None
        name = os.path.basename(str(name))
    return {
        'ok': True,
        'vendor': connection.vendor,
        'name': str(name or ''),
        'latency_ms': latency_ms,
        'size': int(size) if size is not None else None,
        'size_label': _format_bytes(size),
        'tables': tables,
        'detail': f'{latency_ms} ms',
    }


def _cache():
    token = str(time.time())
    started = time.perf_counter()
    try:
        cache.set('platform:health-probe', token, timeout=30)
        ok = cache.get('platform:health-probe') == token
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
    except Exception:
        logger.warning('Cache health check failed', exc_info=True)
        ok = False
        latency_ms = None
    backend = settings.CACHES.get('default', {}).get('BACKEND', '')
    label = backend.rsplit('.', 1)[-1] if backend else 'unknown'
    return {
        'ok': ok,
        'backend': label,
        'latency_ms': latency_ms,
        'detail': f'{latency_ms} ms · {label}' if ok and latency_ms is not None else 'Cache did not respond.',
    }


def _application():
    since = timezone.now() - timedelta(hours=24)
    users = UserProfile.objects.aggregate(
        users=Count('user_id'),
        active_users=Count('user_id', filter=Q(is_active=True)),
        admins=Count('user_id', filter=Q(role=UserRole.ADMIN)),
        faculty=Count('user_id', filter=Q(role=UserRole.FACULTY)),
        superadmins=Count('user_id', filter=Q(role=UserRole.SUPERADMIN)),
    )
    institutions = Institution.objects.aggregate(
        institutions=Count('institution_id'),
        active_institutions=Count('institution_id', filter=Q(is_active=True)),
    )
    return {
        **institutions,
        **users,
        'courses': Course.objects.count(),
        'assessments': Assessment.objects.count(),
        'audit_events_24h': AuditLog.objects.filter(timestamp__gte=since).count(),
        'debug': bool(settings.DEBUG),
    }


def _lag_status(latency_ms, ok, warn_at, critical_at):
    if not ok:
        return 'critical'
    if latency_ms is None:
        return 'unknown'
    if latency_ms >= critical_at:
        return 'critical'
    if latency_ms >= warn_at:
        return 'warning'
    return 'healthy'


def _component(name, latency_ms, status, detail):
    return {
        'name': name,
        'latency_ms': latency_ms,
        'status': status,
        'detail': detail,
    }


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _probe_http(name, url, warn_at, critical_at):
    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        return _component(name, None, 'unknown', 'No address configured')
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    resolver = ThreadPoolExecutor(max_workers=1)
    try:
        resolver.submit(socket.getaddrinfo, host, port, socket.AF_UNSPEC, socket.SOCK_STREAM).result(timeout=0.4)
    except Exception:
        return _component(name, None, 'unknown', 'Not visible from the API process')
    finally:
        resolver.shutdown(wait=False, cancel_futures=True)

    started = time.perf_counter()
    try:
        request = urllib.request.Request(url, method='GET', headers={'User-Agent': 'atlas-health'})
        opener = urllib.request.build_opener(_NoRedirect)
        try:
            with opener.open(request, timeout=1.0) as response:
                response.read(128)
                code = getattr(response, 'status', 200)
        except urllib.error.HTTPError as exc:
            code = exc.code
        elapsed = round((time.perf_counter() - started) * 1000, 1)
        ok = code < 500
        status = _lag_status(elapsed, ok, warn_at, critical_at)
        detail = f'{elapsed} ms' if ok else f'HTTP {code} after {elapsed} ms'
        return _component(name, elapsed, status, detail)
    except Exception:
        elapsed = round((time.perf_counter() - started) * 1000, 1)
        return _component(name, elapsed, 'critical', f'No response after {elapsed} ms')


def note_backend_latency(path, elapsed_ms):
    """Remember ordinary API time. Generation and this health check are left out."""
    if any(marker in path for marker in ('/system-health', '/generate', '/upload', '/semantic-search')):
        return
    try:
        samples = list(cache.get(BACKEND_LATENCY_KEY) or [])
        samples.append(round(float(elapsed_ms), 1))
        cache.set(BACKEND_LATENCY_KEY, samples[-30:], timeout=600)
    except Exception:
        logger.debug('Could not store backend latency', exc_info=True)


def _backend_latency():
    try:
        samples = [float(value) for value in (cache.get(BACKEND_LATENCY_KEY) or [])]
    except Exception:
        return None
    if not samples:
        return None
    samples.sort()
    return round(samples[len(samples) // 2], 1)


def _stack_lag(database, cache_status):
    backend_ms = _backend_latency()
    if backend_ms is None:
        backend = _component('Backend', None, 'unknown', 'No recent API requests to time')
    else:
        backend = _component(
            'Backend',
            backend_ms,
            _lag_status(backend_ms, True, 400, 1500),
            f'{backend_ms} ms median over recent requests',
        )
    components = [
        backend,
        _component(
            'Database',
            database.get('latency_ms'),
            'critical' if not database.get('ok') else _lag_status(database.get('latency_ms'), True, 300, 1200),
            database.get('detail') if database.get('ok') else 'Database did not respond',
        ),
        _component(
            'Redis',
            cache_status.get('latency_ms'),
            'critical' if not cache_status.get('ok') else _lag_status(cache_status.get('latency_ms'), True, 40, 200),
            cache_status.get('detail') or 'Cache did not respond',
        ),
    ]

    probes = [
        ('Frontend', os.environ.get('ATLAS_PROBE_FRONTEND_URL', 'http://frontend/'), 250, 1000),
        ('Nginx', os.environ.get('ATLAS_PROBE_NGINX_URL', 'http://nginx/'), 250, 1000),
    ]
    ollama = (os.environ.get('OLLAMA_BASE_URL') or '').strip().rstrip('/')
    if ollama:
        probes.append(('Ollama', f'{ollama}/api/tags', 800, 2500))
    else:
        components.append(_component('Ollama', None, 'unknown', 'Not configured'))

    if probes:
        with ThreadPoolExecutor(max_workers=len(probes)) as pool:
            futures = [
                pool.submit(_probe_http, name, url, warn_at, critical_at)
                for name, url, warn_at, critical_at in probes
            ]
            components.extend(future.result() for future in futures)

    order = ['Nginx', 'Frontend', 'Backend', 'Database', 'Redis', 'Ollama']
    components.sort(key=lambda row: order.index(row['name']) if row['name'] in order else 99)
    timed = [row for row in components if row.get('latency_ms') is not None and row['status'] != 'unknown']
    slowest = max(timed, key=lambda row: row['latency_ms']) if timed else None
    return {
        'slowest': None if slowest is None else {
            'name': slowest['name'],
            'latency_ms': slowest['latency_ms'],
            'status': slowest['status'],
        },
        'down': [row['name'] for row in components if row['status'] == 'critical'],
        'components': components,
    }


def _services(cpu, memory, disk, database, cache_status):
    rows = [
        {
            'name': 'Database',
            'status': 'healthy' if database.get('ok') else 'critical',
            'detail': database.get('detail') or 'Down',
        },
        {
            'name': 'Cache',
            'status': 'healthy' if cache_status.get('ok') else 'warning',
            'detail': cache_status.get('detail') or 'Down',
        },
        {
            'name': 'CPU',
            'status': _status_for_percent(cpu.get('percent'), 80, 95) if cpu.get('available') else 'unknown',
            'detail': f"{cpu.get('percent')}%" if cpu.get('percent') is not None else 'Not reported on this host',
        },
        {
            'name': 'Memory',
            'status': _status_for_percent(memory.get('percent'), 80, 95) if memory.get('available') else 'unknown',
            'detail': (
                f"{memory.get('used_label')} of {memory.get('total_label')}"
                if memory.get('available') else 'Not reported on this host'
            ),
        },
        {
            'name': 'Disk',
            'status': _status_for_percent(disk.get('percent'), 80, 92) if disk.get('available') else 'critical',
            'detail': (
                f"{disk.get('used_label')} of {disk.get('total_label')} · {disk.get('free_label')} free"
                if disk.get('available') else 'Disk could not be read'
            ),
        },
    ]
    return rows


def _history():
    since = timezone.now() - timedelta(hours=24)
    try:
        rows = list(SystemMetricSample.objects.filter(sampled_at__gte=since).order_by('sampled_at')[:300])
    except Exception as exc:
        if 'does not exist' in str(exc).lower():
            logger.debug('System metric history is unavailable until the platform migration is applied')
        else:
            logger.warning('System metric history is unavailable', exc_info=True)
        return []
    return [
        {
            'time': row.sampled_at.isoformat(),
            'cpu': round(row.cpu_percent, 1),
            'memory': round(row.memory_percent, 1),
            'disk': round(row.disk_percent, 1),
            'load': None if row.load_1 is None else round(row.load_1, 2),
        }
        for row in rows
    ]


def activity_by_day(days=14):
    days = max(1, min(int(days), 31))
    today = timezone.localdate()
    start = today - timedelta(days=days - 1)
    grouped = {}
    rows = (
        AuditLog.objects.filter(timestamp__date__gte=start)
        .annotate(day=TruncDate('timestamp'))
        .values('day')
        .annotate(total=Count('log_id'))
    )
    for row in rows:
        day = row['day']
        if hasattr(day, 'date'):
            day = day.date()
        grouped[day] = row['total']
    series = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        series.append({
            'name': day.strftime('%b %d'),
            'events': grouped.get(day, 0),
        })
    return series


def collect_snapshot(measure_cpu=False):
    cpu = _cpu(measure_cpu)
    memory = _memory()
    disk = _disk(detailed=measure_cpu)
    cache_status = _cache()
    load = _load_average()
    uptime = _uptime()
    application = _application()
    database = _database()
    lag = _stack_lag(database, cache_status) if measure_cpu else {
        'slowest': None,
        'down': [],
        'components': [],
    }
    services = _services(cpu, memory, disk, database, cache_status)
    ranks = {'healthy': 0, 'unknown': 0, 'warning': 2, 'critical': 3}
    statuses = [row['status'] for row in services]
    statuses.extend(row['status'] for row in lag['components'])
    worst = max((ranks.get(status, 0) for status in statuses), default=0)
    overall = {0: 'healthy', 1: 'limited', 2: 'warning', 3: 'critical'}[worst]
    broker = str(getattr(settings, 'CELERY_BROKER_URL', '') or '')
    return {
        'collected_at': timezone.now().isoformat(),
        'overall': overall,
        'host': {
            'hostname': socket.gethostname(),
            'platform': platform.platform(),
            'python': platform.python_version(),
            'cpu_count': cpu.get('count') or 0,
        },
        'uptime': uptime,
        'cpu': cpu,
        'load': load,
        'memory': memory,
        'disk': disk,
        'database': database,
        'cache': cache_status,
        'lag': lag,
        'worker': {
            'configured': bool(broker),
            'detail': 'Task broker is configured' if broker else 'No task broker is configured',
        },
        'application': application,
        'services': services,
        'history': _history(),
    }


def maybe_record_sample():
    """Store host load at most once a minute. This must stay cheap and never break a request."""
    try:
        if not cache.add(SAMPLE_LOCK, 1, timeout=SAMPLE_LOCK_SECONDS):
            return
    except Exception:
        return
    try:
        cpu = _cpu(measure=False)
        memory = _memory()
        disk = _disk()
        load = _load_average() or {}
        SystemMetricSample.objects.create(
            cpu_percent=cpu.get('percent') or 0,
            memory_percent=memory.get('percent') or 0,
            disk_percent=disk.get('percent') or 0,
            load_1=load.get('1'),
        )
        cutoff = timezone.now() - timedelta(hours=48)
        SystemMetricSample.objects.filter(sampled_at__lt=cutoff).delete()
    except Exception as exc:
        if 'does not exist' in str(exc).lower():
            logger.debug('System metric sample skipped until the platform migration is applied')
        else:
            logger.warning('Could not store a system metric sample', exc_info=True)
