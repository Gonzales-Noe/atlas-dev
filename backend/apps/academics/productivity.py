"""Faculty productivity for the institution admin dashboard.

Counts teaching artifacts only, as institution totals. Scores, rosters, scans,
and faculty names are out of scope.
"""

from datetime import timedelta

from django.utils import timezone

from apps.grading.models import OmrGradingJob
from apps.integrations.models import (
    AnalyticsSnapshot,
    Assessment,
    Course,
    CourseFile,
    Module,
    Syllabus,
    UserProfile,
    UserRole,
)

OUTPUT_KINDS = ('syllabi', 'modules', 'assessments', 'source_files')
WEEK_COUNT = 12
PACE_STAGES = (
    ('syllabus', 'Syllabus', 'created_at', 'syllabus_at'),
    ('module', 'Modules', 'syllabus_at', 'module_at'),
    ('assessment', 'Assessments', 'module_at', 'assessment_at'),
    ('grading', 'Grading', 'assessment_at', 'grading_at'),
    ('analytics', 'Analytics', 'grading_at', 'analytics_at'),
)


def _as_aware(value):
    if timezone.is_naive(value):
        return timezone.make_aware(value, timezone.get_current_timezone())
    return value


def _week_start(value):
    moment = timezone.localtime(_as_aware(value))
    return moment.date() - timedelta(days=moment.weekday())


def build_faculty_productivity(faculty_ids, events, *, now=None, weeks=WEEK_COUNT):
    """Shape faculty ids and output events into institution-wide chart data.

    events: tuples of (faculty_id, kind, timestamp). Names are never returned.
    """
    allowed = {str(faculty_id) for faculty_id in faculty_ids}
    current = timezone.localtime(now or timezone.now())
    this_week = current.date() - timedelta(days=current.weekday())
    week_starts = [this_week - timedelta(weeks=offset) for offset in range(weeks - 1, -1, -1)]
    week_index = {start: index for index, start in enumerate(week_starts)}
    totals = {kind: 0 for kind in OUTPUT_KINDS}
    weekly = [
        {'week': f"{start.strftime('%b')} {start.day}", 'syllabi': 0, 'modules': 0, 'assessments': 0, 'source_files': 0}
        for start in week_starts
    ]

    for faculty_id, kind, moment in events:
        if kind not in OUTPUT_KINDS or moment is None or str(faculty_id) not in allowed:
            continue
        totals[kind] += 1
        slot = week_index.get(_week_start(moment))
        if slot is not None:
            weekly[slot][kind] += 1

    mix = [
        {'name': 'Syllabi', 'key': 'syllabi', 'value': totals['syllabi']},
        {'name': 'Modules', 'key': 'modules', 'value': totals['modules']},
        {'name': 'Assessments', 'key': 'assessments', 'value': totals['assessments']},
        {'name': 'Source files', 'key': 'source_files', 'value': totals['source_files']},
    ]
    return {'totals': totals, 'mix': mix, 'weekly': weekly}


def _days_between(start, end):
    if start is None or end is None:
        return None
    elapsed = (_as_aware(end) - _as_aware(start)).total_seconds() / 86400
    if elapsed < 0:
        return None
    return elapsed


def _average_days(values):
    if not values:
        return None
    return round(sum(values) / len(values), 1)


def _month_start(value):
    moment = timezone.localtime(_as_aware(value))
    return moment.date().replace(day=1)


def _shift_month(start, offset):
    month_index = start.year * 12 + (start.month - 1) + offset
    year, month_zero = divmod(month_index, 12)
    return start.replace(year=year, month=month_zero + 1, day=1)


def build_workspace_pace(courses, *, now=None, weeks=WEEK_COUNT, months=12):
    """Average days to finish each workspace step, grouped by week and by month.

    A point is the average of steps finished in that period. The result names
    steps only. It does not include faculty, courses, or students.
    """
    current = timezone.localtime(now or timezone.now())
    this_week = current.date() - timedelta(days=current.weekday())
    week_starts = [this_week - timedelta(weeks=offset) for offset in range(weeks - 1, -1, -1)]
    this_month = current.date().replace(day=1)
    month_starts = [_shift_month(this_month, -offset) for offset in range(months - 1, -1, -1)]
    stage_keys = [key for key, _label, _start, _finish in PACE_STAGES]
    weekly_values = {start: {key: [] for key in stage_keys} for start in week_starts}
    monthly_values = {start: {key: [] for key in stage_keys} for start in month_starts}

    for course in courses:
        for key, _label, start_field, finish_field in PACE_STAGES:
            finish = course.get(finish_field)
            duration = _days_between(course.get(start_field), finish)
            if duration is None:
                continue
            week = _week_start(finish)
            month = _month_start(finish)
            if week in weekly_values:
                weekly_values[week][key].append(duration)
            if month in monthly_values:
                monthly_values[month][key].append(duration)

    def series(starts, grouped, label_for):
        rows = []
        for start in starts:
            row = {'period': label_for(start)}
            for key in stage_keys:
                row[key] = _average_days(grouped[start][key])
            rows.append(row)
        return rows

    def window_average(grouped):
        totals = {key: [] for key in stage_keys}
        for bucket in grouped.values():
            for key in stage_keys:
                totals[key].extend(bucket[key])
        return {key: _average_days(totals[key]) for key in stage_keys}

    return {
        'weekly': series(week_starts, weekly_values, lambda start: f"{start.strftime('%b')} {start.day}"),
        'monthly': series(month_starts, monthly_values, lambda start: f"{start.strftime('%b')} {start.year}"),
        'average': {
            'weekly': window_average(weekly_values),
            'monthly': window_average(monthly_values),
        },
    }


def _earliest_by_course(pairs):
    earliest = {}
    for course_id, moment in pairs:
        if course_id is None or moment is None:
            continue
        current = earliest.get(course_id)
        if current is None or moment < current:
            earliest[course_id] = moment
    return earliest


def workspace_pace_for_institution(institution, *, now=None):
    created = dict(
        Course.objects.filter(institution=institution).values_list('course_id', 'created_at')
    )
    syllabi = _earliest_by_course(
        Syllabus.objects.filter(
            course__institution=institution,
            generated_at__isnull=False,
        ).values_list('course_id', 'generated_at')
    )
    modules = _earliest_by_course(
        Module.objects.filter(
            syllabus__course__institution=institution,
            generated_at__isnull=False,
        ).values_list('syllabus__course_id', 'generated_at')
    )
    assessments = _earliest_by_course(
        Assessment.objects.filter(
            course__institution=institution,
            generated_at__isnull=False,
        ).values_list('course_id', 'generated_at')
    )
    grading = _earliest_by_course(
        OmrGradingJob.objects.filter(
            course__institution=institution,
            finished_at__isnull=False,
        ).values_list('course_id', 'finished_at')
    )
    analytics = _earliest_by_course(
        AnalyticsSnapshot.objects.filter(
            course__institution=institution,
        ).values_list('course_id', 'generated_at')
    )
    courses = [
        {
            'created_at': created.get(course_id),
            'syllabus_at': syllabi.get(course_id),
            'module_at': modules.get(course_id),
            'assessment_at': assessments.get(course_id),
            'grading_at': grading.get(course_id),
            'analytics_at': analytics.get(course_id),
        }
        for course_id in created
    ]
    return build_workspace_pace(courses, now=now)


def faculty_productivity_for_institution(institution):
    faculty_ids = set(
        UserProfile.objects.filter(
            institution=institution,
            role=UserRole.FACULTY,
        ).values_list('user_id', flat=True)
    )

    events = []
    syllabi = Syllabus.objects.filter(
        course__institution=institution,
        generated_at__isnull=False,
        course__syllabus_owner_id__in=faculty_ids,
    ).values_list('course__syllabus_owner_id', 'generated_at')
    events.extend((owner_id, 'syllabi', generated_at) for owner_id, generated_at in syllabi)

    modules = Module.objects.filter(
        generated_at__isnull=False,
        faculty_id__in=faculty_ids,
        syllabus__course__institution=institution,
    ).values_list('faculty_id', 'generated_at')
    events.extend((faculty_id, 'modules', generated_at) for faculty_id, generated_at in modules)

    assessments = Assessment.objects.filter(
        course__institution=institution,
        generated_at__isnull=False,
        course__syllabus_owner_id__in=faculty_ids,
    ).values_list('course__syllabus_owner_id', 'generated_at')
    events.extend((owner_id, 'assessments', generated_at) for owner_id, generated_at in assessments)

    files = CourseFile.objects.filter(
        created_at__isnull=False,
        course__institution=institution,
        uploader_id__in=faculty_ids,
    ).values_list('uploader_id', 'created_at')
    events.extend((uploader_id, 'source_files', created_at) for uploader_id, created_at in files)

    payload = build_faculty_productivity(faculty_ids, events)
    payload['pace'] = workspace_pace_for_institution(institution)
    return payload
