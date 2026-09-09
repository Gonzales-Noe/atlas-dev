import logging
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError, PermissionDenied

from apps.integrations.models import (
    Assessment,
    AssessmentItem,
    Course,
    CourseLoad,
    Ilo,
    UserProfile,
    UserRole,
    AssessmentScoreResult,
)
from apps.grading.models import BubbleSheetScan, BubbleSheetTemplate

from .serializers import (
    FacultySheetAnalysisSerializer,
    GoogleSheetsIngestSerializer,
    PrescriptiveAnalyticsSerializer,
)
from .services import (
    GoogleSheetsService,
    PrescriptiveAnalyticsService,
)
from .services_api_key import GoogleSheetsAPIKeyService

logger = logging.getLogger(__name__)


def _get_sheet_data_with_available_credentials(sheet_id, range_name):
    api_key_service = GoogleSheetsAPIKeyService()
    if api_key_service.api_key:
        return api_key_service.get_sheet_data(sheet_id, range_name)

    service_account_service = GoogleSheetsService()
    if service_account_service.service:
        return service_account_service.get_sheet_data(sheet_id, range_name)

    raise ValueError('Google Sheets API credentials are not configured.')


def _normalize_header(value):
    return str(value).strip().lower().replace('_', ' ')


def _build_ilo_mapping(course_id, headers, means, weighting_schema=None):
    ilos = list(Ilo.objects.filter(course_id=course_id).order_by('ilo_code', 'ilo_id'))
    explicit_mapping = _build_explicit_ilo_mapping(weighting_schema, headers, ilos)
    if explicit_mapping:
        return explicit_mapping

    if not ilos:
        return {}

    numeric_columns = [index for index in sorted(means.keys()) if means.get(index) is not None]
    generated_mapping = {}
    for column_index, ilo in zip(numeric_columns, ilos):
        generated_mapping[str(column_index)] = f'{ilo.ilo_code}: {ilo.ilo_description}'

    return generated_mapping


def _build_explicit_ilo_mapping(weighting_schema, headers, ilos):
    if not isinstance(weighting_schema, dict):
        return {}

    raw_mapping = (
        weighting_schema.get('ilo_mapping')
        or weighting_schema.get('column_ilo_mapping')
        or weighting_schema.get('column_to_ilo')
    )
    if not isinstance(raw_mapping, dict):
        return {}

    ilo_by_id = {str(ilo.ilo_id): f'{ilo.ilo_code}: {ilo.ilo_description}' for ilo in ilos}
    ilo_by_code = {ilo.ilo_code.lower(): f'{ilo.ilo_code}: {ilo.ilo_description}' for ilo in ilos}
    resolved_mapping = {}

    for raw_column, raw_ilo in raw_mapping.items():
        column_index = _resolve_column_index(raw_column, headers)
        ilo_description = _resolve_ilo_description(raw_ilo, ilo_by_id, ilo_by_code)
        if column_index is None or not ilo_description:
            continue
        resolved_mapping[str(column_index)] = ilo_description

    return resolved_mapping


def _resolve_column_index(raw_column, headers):
    if isinstance(raw_column, int):
        return raw_column if 0 <= raw_column < len(headers) else None

    column_text = str(raw_column).strip()
    if column_text.isdigit():
        column_index = int(column_text)
        return column_index if 0 <= column_index < len(headers) else None

    normalized_column = _normalize_header(column_text)
    for index, header in enumerate(headers):
        if _normalize_header(header) == normalized_column:
            return index

    return None


def _resolve_ilo_description(raw_ilo, ilo_by_id, ilo_by_code):
    if isinstance(raw_ilo, dict):
        if raw_ilo.get('ilo_id'):
            return ilo_by_id.get(str(raw_ilo['ilo_id']))
        if raw_ilo.get('ilo_code'):
            return ilo_by_code.get(str(raw_ilo['ilo_code']).lower())
        if raw_ilo.get('ilo_description'):
            return str(raw_ilo['ilo_description']).strip()

    if raw_ilo is None:
        return None

    ilo_text = str(raw_ilo).strip()
    if not ilo_text:
        return None

    return ilo_by_id.get(ilo_text) or ilo_by_code.get(ilo_text.lower()) or ilo_text


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def prescriptive_recommendations(request):
    """
    Endpoint: POST /api/analytics/prescriptive-recommendations/
    
    Expected Body:
    {
        "sheet_id": "<sheet_id>",
        "range": "Assessment 1 Scores!B1:C21",
        "ilo_mapping": {
            "0": "ILO 1: Basic concepts", 
            "1": "ILO 3: Advanced implementation"
        }
    }
    """
    try:
        serializer = PrescriptiveAnalyticsSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        sheet_id = serializer.validated_data.get('sheet_id')
        range_name = serializer.validated_data.get('range')
        ilo_mapping = serializer.validated_data.get('ilo_mapping')

        # Fetch data via API Key
        sheets_service = GoogleSheetsAPIKeyService()
        if not sheets_service.api_key:
            return Response(
                {"success": False, "error": "Google Sheets API Key is not configured."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        raw_data = sheets_service.get_sheet_data(sheet_id, range_name)

        # Compute Means & Generate Recs
        analytics_service = PrescriptiveAnalyticsService()
        means_data = analytics_service.compute_column_means(raw_data)
        
        if not means_data.get('means'):
            return Response(
                {"success": False, "error": "Could not compute means from the provided Google Sheet data."},
                status=status.HTTP_400_BAD_REQUEST
            )

        recommendation = analytics_service.generate_recommendations(means_data, ilo_mapping)

        return Response(
            {
                "success": True,
                "data": {
                    "computed_means": means_data['means'],
                    "headers": means_data['headers'],
                    "recommendations": recommendation
                }
            },
            status=status.HTTP_200_OK
        )

    except Exception as e:
        logger.error(f"Error generating prescriptive recommendations: {str(e)}")
        return Response(
            {"success": False, "error": f"Failed: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def normalize_grade_records(raw_data):
    """
    Transform raw Google Sheets data into normalized grade records.
    
    Expected input format:
    First row: headers (Student ID, Name, Assignment 1, Assignment 2, etc.)
    Following rows: student data
    
    Returns:
        list: Normalized grade records with metadata
    """
    if not raw_data or 'values' not in raw_data:
        return []

    values = raw_data.get('values', [])
    
    if len(values) < 2:  # Need headers + at least 1 data row
        return []

    headers = values[0]
    records = []

    for row in values[1:]:
        # Pad row with empty strings if needed
        while len(row) < len(headers):
            row.append('')

        record = {}
        for i, header in enumerate(headers):
            record[header.strip().lower().replace(' ', '_')] = row[i] if i < len(row) else ''

        records.append(record)

    return records


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def faculty_sheet_analysis(request):
    try:
        serializer = FacultySheetAnalysisSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        course_id = serializer.validated_data['course_id']
        sheet_id = serializer.validated_data['sheet_id']
        range_name = serializer.validated_data['range']
        weighting_schema = serializer.validated_data.get('weighting_schema')

        faculty_profile = request.user
        if not faculty_profile:
            raise PermissionDenied('No faculty profile is linked to the authenticated user.')

        if faculty_profile.role not in (UserRole.ADMIN, UserRole.SUPERADMIN):
            if not CourseLoad.objects.filter(course_id=course_id, faculty_id=faculty_profile.user_id).exists():
                raise PermissionDenied('You are not assigned to the requested course.')

        raw_data = _get_sheet_data_with_available_credentials(sheet_id, range_name)
        normalized_records = normalize_grade_records(raw_data)

        analytics_service = PrescriptiveAnalyticsService()
        means_data = analytics_service.compute_column_means(raw_data)
        ilo_mapping = _build_ilo_mapping(
            course_id=course_id,
            headers=means_data.get('headers', []),
            means=means_data.get('means', {}),
            weighting_schema=weighting_schema,
        )

        if means_data.get('means') and ilo_mapping:
            recommendations = analytics_service.generate_recommendations(means_data, ilo_mapping)
        elif means_data.get('means'):
            recommendations = 'No course ILO mapping could be derived for this course.'
        else:
            recommendations = 'No numeric assessment columns were found in the provided Google Sheet range.'

        mapping_record = {
            'course_id': str(course_id),
            'sheet_id': sheet_id,
            'range': range_name,
        }

        return Response(
            {
                'success': True,
                'mapping': mapping_record,
                'sheet_info': {
                    'sheet_id': sheet_id,
                    'range': range_name,
                    'total_records': len(normalized_records),
                },
                'sheet_data': raw_data,
                'data': normalized_records,
                'analytics': {
                    'headers': means_data.get('headers', []),
                    'computed_means': means_data.get('means', {}),
                    'ilo_mapping': ilo_mapping,
                    'recommendations': recommendations,
                },
            },
            status=status.HTTP_200_OK,
        )

    except ValidationError as e:
        logger.error(f"Validation error while analyzing faculty sheet: {str(e)}")
        return Response({"success": False, "error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except PermissionDenied as e:
        logger.error(f"Permission denied while analyzing faculty sheet: {str(e)}")
        return Response({"success": False, "error": str(e)}, status=status.HTTP_403_FORBIDDEN)
    except Exception as e:
        logger.error(f"Error analyzing faculty sheet: {str(e)}")
        return Response(
            {"success": False, "error": f"Failed to analyze faculty sheet: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ingest_google_sheets(request):
    """
    Ingest and normalize data from Google Sheets.
    
    Endpoint: POST /api/analytics/ingest/
    
    Expected Request Body:
    {
        "sheet_id": "<faculty_sheet_id>",
        "range": "Sheet1!A1:F30"  # Optional, defaults to Sheet1!A1:Z1000
    }
    
    Required: JWT Bearer token authentication
    
    Returns:
        200 OK: {
            "success": true,
            "sheet_info": {
                "sheet_id": "...",
                "range": "...",
                "total_records": N
            },
            "data": [normalized records]
        }
        
        400 Bad Request: Validation errors
        401 Unauthorized: Missing/invalid JWT token
        403 Forbidden: User lacks required permissions
        500 Internal Server Error: Google Sheets API error
    """
    try:
        # Validate request data
        serializer = GoogleSheetsIngestSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning(f"Validation error: {serializer.errors}")
            return Response(
                {
                    "success": False,
                    "errors": serializer.errors
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        sheet_id = serializer.validated_data.get('sheet_id')
        range_name = serializer.validated_data.get('range')

        # Initialize Google Sheets service using the API Key service we verified
        sheets_service = GoogleSheetsAPIKeyService()

        # Wait, the API Key service doesn't have a `.service` attribute check, it uses `.api_key`.
        if not sheets_service.api_key:
            logger.error("Google Sheets API Key not initialized")
            return Response(
                {
                    "success": False,
                    "error": "Google Sheets API Key is not configured. "
                             "Please check server configuration."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Retrieve data from Google Sheets
        raw_data = sheets_service.get_sheet_data(sheet_id, range_name)

        # Normalize the data
        normalized_records = normalize_grade_records(raw_data)

        logger.info(
            f"Successfully ingested {len(normalized_records)} records "
            f"from sheet {sheet_id}"
        )

        return Response(
            {
                "success": True,
                "sheet_info": {
                    "sheet_id": sheet_id,
                    "range": range_name,
                    "total_records": len(normalized_records)
                },
                "data": normalized_records
            },
            status=status.HTTP_200_OK
        )

    except ValidationError as e:
        logger.error(f"Validation error: {str(e)}")
        return Response(
            {
                "success": False,
                "error": str(e)
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    except PermissionDenied as e:
        logger.error(f"Permission denied: {str(e)}")
        return Response(
            {
                "success": False,
                "error": "You do not have permission to access this sheet."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    except Exception as e:
        logger.error(f"Error ingesting Google Sheets data: {str(e)}")
        return Response(
            {
                "success": False,
                "error": f"Failed to ingest data: {str(e)}"
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ingest_google_sheets_api_key(request):
    """
    Ingest and normalize data from Google Sheets using Browser API Key.
    
    Endpoint: POST /api/analytics/ingest-apikey/
    
    Expected Request Body:
    {
        "sheet_id": "<faculty_sheet_id>",
        "range": "Sheet1!A1:F30"  # Optional, defaults to Sheet1!A1:Z1000
    }
    
    Required: JWT Bearer token authentication
    
    Returns:
        200 OK: {
            "success": true,
            "sheet_info": {
                "sheet_id": "...",
                "range": "...",
                "total_records": N
            },
            "data": [normalized records]
        }
        
        400 Bad Request: Validation errors
        401 Unauthorized: Missing/invalid JWT token
        403 Forbidden: User lacks required permissions
        500 Internal Server Error: Google Sheets API error
    """
    try:
        # Validate request data
        serializer = GoogleSheetsIngestSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning(f"Validation error: {serializer.errors}")
            return Response(
                {
                    "success": False,
                    "errors": serializer.errors
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        sheet_id = serializer.validated_data.get('sheet_id')
        range_name = serializer.validated_data.get('range')

        # Initialize Google Sheets service with API Key
        sheets_service = GoogleSheetsAPIKeyService()

        if not sheets_service.api_key:
            logger.error("Google Sheets API Key not configured")
            return Response(
                {
                    "success": False,
                    "error": "Google Sheets API Key is not configured. "
                             "Please check server configuration."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Retrieve data from Google Sheets
        raw_data = sheets_service.get_sheet_data(sheet_id, range_name)

        # Normalize the data
        normalized_records = normalize_grade_records(raw_data)

        logger.info(
            f"Successfully ingested {len(normalized_records)} records "
            f"from sheet {sheet_id} using API Key"
        )

        return Response(
            {
                "success": True,
                "sheet_info": {
                    "sheet_id": sheet_id,
                    "range": range_name,
                    "total_records": len(normalized_records)
                },
                "data": normalized_records
            },
            status=status.HTTP_200_OK
        )

    except ValidationError as e:
        logger.error(f"Validation error: {str(e)}")
        return Response(
            {
                "success": False,
                "error": str(e)
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    except PermissionDenied as e:
        logger.error(f"Permission denied: {str(e)}")
        return Response(
            {
                "success": False,
                "error": "You do not have permission to access this sheet."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    except Exception as e:
        logger.error(f"Error ingesting Google Sheets data (API Key): {str(e)}")
        return Response(
            {
                "success": False,
                "error": f"Failed to ingest data: {str(e)}"
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ── Bloom Item Analysis ───────────────────────────────────────────────────────


def _faculty_can_access_course(profile, course_id) -> bool:
    if not profile:
        return False
    if profile.role in (UserRole.ADMIN, UserRole.SUPERADMIN):
        return True
    return CourseLoad.objects.filter(course_id=course_id, faculty_id=profile.user_id).exists()


def _get_faculty_profile(request):
    email = (getattr(request.user, "email", "") or "").strip()
    username = (getattr(request.user, "username", "") or "").strip()
    for identifier in [email, username]:
        if not identifier:
            continue
        profile = UserProfile.objects.filter(email__iexact=identifier).first()
        if profile:
            return profile
    return None


BLOOM_ORDER = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bloom_item_analysis(request):
    """
    GET /api/analytics/bloom-item-analysis/?course_id=<uuid>&assessment_id=<uuid>

    Returns:
      - class_average: overall class average score
      - passing_threshold: from BubbleSheetTemplate if available
      - section_averages: per-section average scores
      - per_student_bloom: per student, per Bloom level, count of items correct vs total
      - bloom_summary: aggregated Bloom-level weakness across all students
    """
    faculty = _get_faculty_profile(request)
    if not faculty:
        return Response(
            {"success": False, "detail": "No faculty profile linked."},
            status=status.HTTP_403_FORBIDDEN,
        )

    course_id = request.query_params.get("course_id", "").strip()
    assessment_id = request.query_params.get("assessment_id", "").strip()

    if not course_id or not assessment_id:
        return Response(
            {"success": False, "detail": "course_id and assessment_id are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not _faculty_can_access_course(faculty, course_id):
        return Response(
            {"success": False, "detail": "Access denied."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        assessment = Assessment.objects.get(assessment_id=assessment_id, course_id=course_id)
    except Assessment.DoesNotExist:
        return Response(
            {"success": False, "detail": "Assessment not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Gather items with their Bloom level from rubric
    items = AssessmentItem.objects.filter(assessment_id=assessment_id).select_related("module")
    item_bloom_map: dict[int, dict] = {}  # item_number → {bloom_level, section_title}
    for it in items:
        rubric = it.rubric or {}
        item_no = rubric.get("item_number")
        if item_no is None:
            continue
        bloom = (rubric.get("bloom_level") or "").strip().title()
        section = (rubric.get("section_title") or "General").strip()
        item_bloom_map[int(item_no)] = {
            "bloom_level": bloom if bloom in BLOOM_ORDER else "",
            "section_title": section,
            "correct_answer": rubric.get("correct_answer") or rubric.get("answer_key") or "",
        }

    if not item_bloom_map:
        return Response(
            {"success": False, "detail": "Assessment has no items with Bloom metadata (rubric)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Collect student responses from BubbleSheetScan
    templates = BubbleSheetTemplate.objects.filter(assessment_id=assessment_id)
    student_responses: dict[str, dict] = {}  # student_id → { item_number: chosen_letter }

    for tpl in templates:
        scans = BubbleSheetScan.objects.filter(template=tpl)
        for s in scans:
            sid = (s.student_identifier or "").strip() or "unknown"
            student_responses.setdefault(sid, {})
            for item_no_str, ans in (s.responses or {}).items():
                try:
                    ino = int(item_no_str)
                except (ValueError, TypeError):
                    continue
                if ino in item_bloom_map:
                    student_responses[sid][ino] = str(ans).strip().upper()

    if not student_responses:
        return Response(
            {
                "success": True,
                "course_id": course_id,
                "assessment_id": assessment_id,
                "assessment_title": assessment.title,
                "message": "No student scan data found for this assessment.",
                "class_average": None,
                "passing_threshold": None,
                "section_averages": [],
                "per_student_bloom": [],
                "bloom_summary": [],
            },
            status=status.HTTP_200_OK,
        )

    # Passing threshold from first template
    passing = None
    first_tpl = templates.first()
    if first_tpl and first_tpl.passing_score:
        passing = float(first_tpl.passing_score)

    # Compute per-student Bloom stats
    per_student_bloom: list[dict] = []
    all_scores: list[float] = []
    section_correct: dict[str, float] = {}
    section_total: dict[str, int] = {}

    for sid, responses in sorted(student_responses.items()):
        student_bloom = {b: {"correct": 0, "total": 0} for b in BLOOM_ORDER}
        student_total_correct = 0
        student_total_items = 0

        for item_no, info in item_bloom_map.items():
            chosen = responses.get(item_no, "?")
            correct_ans = info["correct_answer"].strip().upper()
            bloom = info["bloom_level"]
            section = info["section_title"]

            student_total_items += 1
            section_total[section] = section_total.get(section, 0) + 1

            if chosen == correct_ans:
                student_total_correct += 1
                section_correct[section] = section_correct.get(section, 0) + 1

            if bloom and bloom in student_bloom:
                student_bloom[bloom]["total"] += 1
                if chosen == correct_ans:
                    student_bloom[bloom]["correct"] += 1

        score_pct = (student_total_correct / student_total_items * 100) if student_total_items > 0 else 0
        all_scores.append(score_pct)

        per_student_bloom.append({
            "student_id": sid,
            "score_percent": round(score_pct, 1),
            "correct": student_total_correct,
            "total_items": student_total_items,
            "bloom_breakdown": {
                b: {
                    "correct": student_bloom[b]["correct"],
                    "total": student_bloom[b]["total"],
                    "pct": (
                        round(student_bloom[b]["correct"] / student_bloom[b]["total"] * 100, 1)
                        if student_bloom[b]["total"] > 0
                        else None
                    ),
                }
                for b in BLOOM_ORDER
            },
        })

    # Class average
    class_average = round(sum(all_scores) / len(all_scores), 1) if all_scores else None

    # Section averages
    section_averages = []
    for section, total in sorted(section_total.items()):
        correct = section_correct.get(section, 0)
        section_averages.append({
            "section": section,
            "avg_percent": round(correct / total * 100, 1) if total > 0 else 0,
            "total_items": total,
        })

    # Aggregated Bloom weakness summary
    bloom_summary: list[dict] = []
    for b in BLOOM_ORDER:
        correct_total = 0
        count_total = 0
        for ps in per_student_bloom:
            bd = ps["bloom_breakdown"][b]
            correct_total += bd["correct"]
            count_total += bd["total"]
        bloom_summary.append({
            "bloom_level": b,
            "class_correct": correct_total,
            "class_total": count_total,
            "class_pct": round(correct_total / count_total * 100, 1) if count_total > 0 else None,
            "weakness_flag": (
                "low" if count_total > 0 and (correct_total / count_total) < 0.50 else
                "moderate" if count_total > 0 and (correct_total / count_total) < 0.70 else
                "strong" if count_total > 0 else "no_data"
            ),
        })

    return Response(
        {
            "success": True,
            "course_id": course_id,
            "assessment_id": assessment_id,
            "assessment_title": assessment.title,
            "class_average": class_average,
            "passing_threshold": passing,
            "total_students": len(student_responses),
            "section_averages": section_averages,
            "per_student_bloom": per_student_bloom,
            "bloom_summary": bloom_summary,
        },
        status=status.HTTP_200_OK,
    )
