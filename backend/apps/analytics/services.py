import os
import logging
import json
import uuid
from google.oauth2.service_account import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from django.db import connection
from apps.integrations.anthropic_service import AnthropicService
from apps.integrations.models import CourseLoad, Ilo, UserProfile, UserRole

logger = logging.getLogger(__name__)


class GradeSheetMappingService:
    TABLE_NAME = 'grade_sheet_mappings'

    def get_authenticated_profile(self, auth_user):
        identifiers = []
        email = (getattr(auth_user, 'email', '') or '').strip()
        username = (getattr(auth_user, 'username', '') or '').strip()

        if email:
            identifiers.append(email)
        if username and username.lower() != email.lower():
            identifiers.append(username)

        for identifier in identifiers:
            profile = UserProfile.objects.filter(email__iexact=identifier).first()
            if profile:
                return profile

        return None

    def faculty_can_access_course(self, profile, course_id):
        if profile.role in (UserRole.ADMIN, UserRole.SUPERADMIN):
            return True

        return CourseLoad.objects.filter(course_id=course_id, faculty_id=profile.user_id).exists()

    def save_mapping(self, course_id, sheet_id, range_name, weighting_schema=None, term=''):
        columns = self._get_columns()
        mapping_payload = dict(weighting_schema or {})
        mapping_id = uuid.uuid4()

        with connection.cursor() as cursor:
            if {'sheets_document_id', 'sheet_range'}.issubset(columns):
                cursor.execute(
                    """
                    INSERT INTO grade_sheet_mappings (mapping_id, course_id, sheets_document_id, sheet_range, weighting_schema)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING mapping_id
                    """,
                    [
                        str(mapping_id),
                        str(course_id),
                        sheet_id,
                        range_name,
                        json.dumps(weighting_schema) if weighting_schema is not None else None,
                    ],
                )
            elif {'term', 'google_sheet_url'}.issubset(columns):
                mapping_payload.setdefault('sheet_id', sheet_id)
                mapping_payload.setdefault('range', range_name)
                cursor.execute(
                    """
                    INSERT INTO grade_sheet_mappings (mapping_id, course_id, term, google_sheet_url, weighting_schema)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING mapping_id
                    """,
                    [
                        str(mapping_id),
                        str(course_id),
                        term,
                        self._build_google_sheet_url(sheet_id),
                        json.dumps(mapping_payload),
                    ],
                )
            else:
                raise ValueError('grade_sheet_mappings schema is not supported by this backend.')

            mapping_id = cursor.fetchone()[0]

        return {
            'mapping_id': str(mapping_id),
            'course_id': str(course_id),
            'sheet_id': sheet_id,
            'range': range_name,
            'weighting_schema': mapping_payload if {'term', 'google_sheet_url'}.issubset(columns) else weighting_schema,
        }

    def build_ilo_mapping(self, course_id, headers, means, weighting_schema=None):
        ilos = list(Ilo.objects.filter(course_id=course_id).order_by('ilo_code', 'ilo_id'))
        explicit_mapping = self._build_explicit_ilo_mapping(weighting_schema, headers, ilos)
        if explicit_mapping:
            return explicit_mapping

        if not ilos:
            return {}

        numeric_columns = [index for index in sorted(means.keys()) if means.get(index) is not None]
        generated_mapping = {}

        for column_index, ilo in zip(numeric_columns, ilos):
            generated_mapping[str(column_index)] = self._format_ilo(ilo)

        return generated_mapping

    def _build_explicit_ilo_mapping(self, weighting_schema, headers, ilos):
        if not isinstance(weighting_schema, dict):
            return {}

        raw_mapping = (
            weighting_schema.get('ilo_mapping')
            or weighting_schema.get('column_ilo_mapping')
            or weighting_schema.get('column_to_ilo')
        )
        if not isinstance(raw_mapping, dict):
            return {}

        ilo_by_id = {str(ilo.ilo_id): self._format_ilo(ilo) for ilo in ilos}
        ilo_by_code = {ilo.ilo_code.lower(): self._format_ilo(ilo) for ilo in ilos}
        resolved_mapping = {}

        for raw_column, raw_ilo in raw_mapping.items():
            column_index = self._resolve_column_index(raw_column, headers)
            ilo_description = self._resolve_ilo_description(raw_ilo, ilo_by_id, ilo_by_code)
            if column_index is None or not ilo_description:
                continue
            resolved_mapping[str(column_index)] = ilo_description

        return resolved_mapping

    def _resolve_column_index(self, raw_column, headers):
        if isinstance(raw_column, int):
            return raw_column if 0 <= raw_column < len(headers) else None

        column_text = str(raw_column).strip()
        if column_text.isdigit():
            column_index = int(column_text)
            return column_index if 0 <= column_index < len(headers) else None

        normalized_column = self._normalize_header(column_text)
        for index, header in enumerate(headers):
            if self._normalize_header(header) == normalized_column:
                return index

        return None

    def _resolve_ilo_description(self, raw_ilo, ilo_by_id, ilo_by_code):
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

    def _get_columns(self):
        with connection.cursor() as cursor:
            table_description = connection.introspection.get_table_description(cursor, self.TABLE_NAME)
        return {column.name for column in table_description}

    def _build_google_sheet_url(self, sheet_id):
        return f'https://docs.google.com/spreadsheets/d/{sheet_id}/edit'

    def _format_ilo(self, ilo):
        return f'{ilo.ilo_code}: {ilo.ilo_description}'

    def _normalize_header(self, value):
        return str(value).strip().lower().replace('_', ' ')


class PrescriptiveAnalyticsService:
    """Service for computing score metrics and requesting generative prescriptive recommendations."""

    def __init__(self):
        self.anthropic_service = AnthropicService()

    def compute_column_means(self, raw_data):
        """
        Compute the mean of scores for each column assuming first row is headers.
        Ignores rows or cells that cannot be converted to floats.
        """
        if not raw_data or 'values' not in raw_data:
            return {}

        values = raw_data.get('values', [])
        if len(values) < 2:
            return {}

        headers = values[0]
        sums = {i: 0.0 for i in range(len(headers))}
        counts = {i: 0 for i in range(len(headers))}

        for row in values[1:]:
            for i, cell_value in enumerate(row):
                try:
                    num_val = float(str(cell_value).replace(',', '').strip())
                    sums[i] += num_val
                    counts[i] += 1
                except (ValueError, TypeError):
                    continue

        means = {}
        for i in range(len(headers)):
            if counts[i] > 0:
                means[i] = sums[i] / counts[i]
            else:
                means[i] = None

        return {"headers": headers, "means": means}

    def generate_recommendations(self, means_data, ilo_mapping):
        """
        Generates prescriptive recommendations using LLM from Anthropic.

        Args:
            means_data: Dict with 'headers' and computed 'means'
            ilo_mapping: Dict mapping column indices (strings) to ILO descriptions
        """
        if not self.anthropic_service.is_configured():
            raise ValueError("Anthropic service is not configured.")

        prompt_details = []
        headers = means_data.get('headers', [])
        means = means_data.get('means', {})

        # Construct the context for the LLM
        for col_idx_str, ilo_desc in ilo_mapping.items():
            if not col_idx_str.isdigit():
                continue
            
            col_idx = int(col_idx_str)
            if col_idx < len(headers) and col_idx in means and means[col_idx] is not None:
                header_name = headers[col_idx]
                mean_score = means[col_idx]
                prompt_details.append(f"- Outcome: {ilo_desc} | Assessment Column: '{header_name}' | Mean Score: {mean_score:.2f}")

        if not prompt_details:
            return "No valid numerical data or matching ILO mappings found to generate recommendations."

        # Prompt for Anthropic Claude
        prompt_text = (
            "You are an expert prescriptive analytics engine for university faculty. "
            "Based on the average student performance in specific assessments mapped to Intended Learning Outcomes (ILOs), "
            "provide specific, actionable prescriptive recommendations on how the faculty can improve student learning or "
            "adjust their teaching methodology for those specific ILOs.\n\n"
            "Below is the data of the ILOs, assessment names, and the mean scores for the class:\n"
            + "\n".join(prompt_details) +
            "\n\nPlease provide actionable recommendations. If a score is particularly low, emphasize remediation strategies."
        )

        messages = [{"role": "user", "content": prompt_text}]

        response = self.anthropic_service.send_message(
            messages=messages,
            system="Provide concise, educational prescriptive recommendations."
        )

        if response.get('success'):
            content = response.get('content', [])
            if content:
                # Extract text from the first content block that has text
                for block in content:
                    if block.get('type') == 'text' and block.get('text'):
                        return block['text']
            return "Unable to parse recommendations from LLM."
        else:
            raise Exception("Failed to generate recommendations via LLM.")


class GoogleSheetsService:
    """Service for interacting with Google Sheets API."""

    # Scopes required for Google Sheets API
    SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

    def __init__(self):
        """Initialize Google Sheets service with credentials."""
        self.service = None
        self._initialize_service()

    def _initialize_service(self):
        """
        Initialize the Google Sheets API service.
        Uses service account credentials from environment.
        """
        try:
            # Try to get service account JSON from environment
            credentials_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
            
            if not credentials_json:
                logger.warning(
                    "GOOGLE_SERVICE_ACCOUNT_JSON not found. "
                    "Google Sheets API will not be available."
                )
                return

            # Create credentials from service account JSON
            credentials = Credentials.from_service_account_info(
                eval(credentials_json),  # Convert string to dict
                scopes=self.SCOPES
            )
            
            # Build the Google Sheets API service
            self.service = build('sheets', 'v4', credentials=credentials)
            logger.info("Google Sheets service initialized successfully.")
            
        except Exception as e:
            logger.error(f"Failed to initialize Google Sheets service: {str(e)}")
            self.service = None

    def get_sheet_data(self, sheet_id, range_name):
        """
        Retrieve data from a Google Sheet.
        
        Args:
            sheet_id (str): Google Sheets document ID
            range_name (str): Cell range (e.g., 'Sheet1!A1:F30')
            
        Returns:
            dict: Contains 'values' list and 'range' information
            
        Raises:
            HttpError: If API call fails
            ValueError: If service is not initialized
        """
        if not self.service:
            raise ValueError(
                "Google Sheets service not initialized. "
                "Check GOOGLE_SERVICE_ACCOUNT_JSON environment variable."
            )

        try:
            result = self.service.spreadsheets().values().get(
                spreadsheetId=sheet_id,
                range=range_name
            ).execute()
            
            logger.info(
                f"Successfully retrieved data from sheet {sheet_id}, range {range_name}"
            )
            return result
            
        except HttpError as error:
            logger.error(
                f"API error retrieving sheet data: {error.resp.status} - {error.content}"
            )
            raise

    def get_sheet_metadata(self, sheet_id):
        """
        Retrieve metadata (title, sheet names) from a Google Sheet.
        
        Args:
            sheet_id (str): Google Sheets document ID
            
        Returns:
            dict: Sheet metadata including title and sheets
            
        Raises:
            HttpError: If API call fails
            ValueError: If service is not initialized
        """
        if not self.service:
            raise ValueError(
                "Google Sheets service not initialized. "
                "Check GOOGLE_SERVICE_ACCOUNT_JSON environment variable."
            )

        try:
            result = self.service.spreadsheets().get(
                spreadsheetId=sheet_id
            ).execute()
            
            logger.info(f"Successfully retrieved metadata for sheet {sheet_id}")
            return result
            
        except HttpError as error:
            logger.error(
                f"API error retrieving sheet metadata: {error.resp.status} - {error.content}"
            )
            raise
