import os
import logging
import requests

logger = logging.getLogger(__name__)


class GoogleSheetsAPIKeyService:
    """Service for interacting with Google Sheets API using Browser API Key."""

    # Google Sheets API endpoint
    SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets"

    def __init__(self):
        """Initialize Google Sheets service with API key."""
        self.api_key = os.environ.get('GOOGLE_API_KEY')
        
        if not self.api_key:
            logger.warning(
                "GOOGLE_API_KEY not found. "
                "Google Sheets API will not be available."
            )

    def get_sheet_data(self, sheet_id, range_name):
        """
        Retrieve data from a Google Sheet using Browser API Key.
        
        Args:
            sheet_id (str): Google Sheets document ID
            range_name (str): Cell range (e.g., 'Sheet1!A1:F30')
            
        Returns:
            dict: Contains 'values' list and 'range' information
            
        Raises:
            ValueError: If API key is not set
            requests.exceptions.RequestException: If API call fails
        """
        if not self.api_key:
            raise ValueError(
                "GOOGLE_API_KEY not configured. "
                "Check GOOGLE_API_KEY environment variable."
            )

        try:
            url = f"{self.SHEETS_API_URL}/{sheet_id}/values/{range_name}"
            params = {
                'key': self.api_key
            }
            
            response = requests.get(url, params=params)
            response.raise_for_status()
            
            result = response.json()
            logger.info(
                f"Successfully retrieved data from sheet {sheet_id}, range {range_name}"
            )
            return result
            
        except requests.exceptions.HTTPError as error:
            logger.error(
                f"API error retrieving sheet data: {error.response.status_code} - {error.response.text}"
            )
            raise
        except Exception as e:
            logger.error(f"Error retrieving sheet data: {str(e)}")
            raise

    def get_sheet_metadata(self, sheet_id):
        """
        Retrieve metadata (title, sheet names) from a Google Sheet.
        
        Args:
            sheet_id (str): Google Sheets document ID
            
        Returns:
            dict: Sheet metadata including title and sheets
            
        Raises:
            ValueError: If API key is not set
            requests.exceptions.RequestException: If API call fails
        """
        if not self.api_key:
            raise ValueError(
                "GOOGLE_API_KEY not configured. "
                "Check GOOGLE_API_KEY environment variable."
            )

        try:
            url = f"{self.SHEETS_API_URL}/{sheet_id}"
            params = {
                'key': self.api_key
            }
            
            response = requests.get(url, params=params)
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"Successfully retrieved metadata for sheet {sheet_id}")
            return result
            
        except requests.exceptions.HTTPError as error:
            logger.error(
                f"API error retrieving sheet metadata: {error.response.status_code} - {error.response.text}"
            )
            raise
        except Exception as e:
            logger.error(f"Error retrieving sheet metadata: {str(e)}")
            raise
