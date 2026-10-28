from django.db import connections

# Messages Postgres and Supavisor return after an idle connection is dropped.
_DISCONNECT_MARKERS = (
    'server closed the connection',
    'connection already closed',
    'connection not open',
    'ssl connection has been closed',
    'ssl syscall error',
    'consuming input failed',
    'terminating connection',
    'connection reset',
    'could not receive data',
    'admin shutdown',
)


def _is_database_disconnect(exception):
    message = str(exception).lower()
    return any(marker in message for marker in _DISCONNECT_MARKERS)


def _can_retry(request):
    if request.method in {'GET', 'HEAD', 'OPTIONS'}:
        return True
    # Login and refresh only read the user row, so one retry cannot double-write.
    return request.method == 'POST' and (
        request.path.startswith('/api/auth/token/')
        or request.path.startswith('/api/auth/google/')
    )


class DatabaseReconnectMiddleware:
    """Retry a request once when Supabase has closed an idle connection."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        if getattr(request, '_atlas_db_retried', False):
            return None
        if not _is_database_disconnect(exception) or not _can_retry(request):
            return None

        request._atlas_db_retried = True
        for connection in connections.all():
            connection.close()
        return self.get_response(request)
