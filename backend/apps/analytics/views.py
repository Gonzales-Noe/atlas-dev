import logging
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError, PermissionDenied

from .serializers import (
    FacultySheetAnalysisSerializer,
    GoogleSheetsIngestSerializer,
    PrescriptiveAnalyticsSerializer,
)
from .services import (
    GoogleSheetsService,
    GradeSheetMappingService,
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
        term = serializer.validated_data.get('term', '')

        mapping_service = GradeSheetMappingService()
        faculty_profile = mapping_service.get_authenticated_profile(request.user)
        if not faculty_profile:
            raise PermissionDenied('No faculty profile is linked to the authenticated user.')

        if not mapping_service.faculty_can_access_course(faculty_profile, course_id):
            raise PermissionDenied('You are not assigned to the requested course.')

        raw_data = _get_sheet_data_with_available_credentials(sheet_id, range_name)
        normalized_records = normalize_grade_records(raw_data)

        analytics_service = PrescriptiveAnalyticsService()
        means_data = analytics_service.compute_column_means(raw_data)
        ilo_mapping = mapping_service.build_ilo_mapping(
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

        mapping_record = mapping_service.save_mapping(
            course_id=course_id,
            sheet_id=sheet_id,
            range_name=range_name,
            weighting_schema=weighting_schema,
            term=term,
        )

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
