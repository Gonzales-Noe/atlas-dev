import logging
import os

logger = logging.getLogger(__name__)

try:
    from anthropic import Anthropic, APIError
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    Anthropic = None
    APIError = Exception


class AnthropicService:
    """Service for interacting with Anthropic Claude API."""
    
    def __init__(self):
        """Initialize Anthropic client."""
        self.api_key = os.environ.get('ANTHROPIC_API_KEY')
        if not ANTHROPIC_AVAILABLE:
            logger.warning("Anthropic SDK not installed")
            self.client = None
        elif not self.api_key:
            logger.warning("ANTHROPIC_API_KEY not found in environment variables")
            self.client = None
        else:
            self.client = Anthropic(api_key=self.api_key)
    
    def is_configured(self):
        """Check if Anthropic API is properly configured."""
        return self.client is not None and self.api_key is not None
    
    def send_message(self, messages, model="claude-3-5-sonnet-20241022", max_tokens=1024, system=None):
        """
        Send a message to Claude API.
        
        Args:
            messages (list): List of message dicts with 'role' and 'content'
            model (str): Model to use
            max_tokens (int): Maximum tokens in response
            system (str): System prompt
            
        Returns:
            dict: API response with content array
            
        Raises:
            APIError: If API call fails
            ValueError: If not configured
        """
        if not self.is_configured():
            raise ValueError(
                "Anthropic API not configured. "
                "Set ANTHROPIC_API_KEY environment variable."
            )
        
        try:
            kwargs = {
                "model": model,
                "max_tokens": max_tokens,
                "messages": messages,
            }
            
            if system:
                kwargs["system"] = system
            
            response = self.client.messages.create(**kwargs)
            
            logger.info(
                f"Claude API call successful. "
                f"Model: {model}, Tokens used: {response.usage.input_tokens + response.usage.output_tokens}"
            )
            
            return {
                "success": True,
                "model": response.model,
                "content": [
                    {
                        "type": block.type,
                        "text": block.text if hasattr(block, 'text') else None
                    }
                    for block in response.content
                ],
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens
                }
            }
            
        except APIError as e:
            logger.error(f"Anthropic API error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error calling Anthropic API: {str(e)}")
            raise
    
    def test_connection(self):
        """
        Test the Anthropic API connection with a simple message.
        
        Returns:
            dict: Test result with success status and message
        """
        if not self.is_configured():
            return {
                "success": False,
                "message": "Anthropic API not configured"
            }
        
        try:
            response = self.send_message(
                messages=[
                    {"role": "user", "content": "Say 'ATLAS API connection successful'"}
                ],
                max_tokens=50
            )
            
            return {
                "success": True,
                "message": "Connection successful",
                "response": response
            }
            
        except Exception as e:
            return {
                "success": False,
                "message": f"Connection failed: {str(e)}"
            }
