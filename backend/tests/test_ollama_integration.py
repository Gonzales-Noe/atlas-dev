from unittest.mock import Mock, patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.integrations.llm_service import LLMService


class OllamaLLMServiceTests(TestCase):
    @patch("apps.integrations.llm_service.requests.post")
    @patch("apps.integrations.llm_service.os.environ.get")
    def test_generate_response_ollama_success(self, mock_env_get, mock_post):
        env = {
            "DEFAULT_LLM_PROVIDER": "ollama",
            "OLLAMA_BASE_URL": "http://127.0.0.1:11434",
            "OLLAMA_DEFAULT_MODEL": "deepseek-r1:8b",
        }
        mock_env_get.side_effect = lambda key, default=None: env.get(key, default)

        mock_response = Mock()
        mock_response.json.return_value = {
            "message": {"role": "assistant", "content": "Local model response."}
        }
        mock_response.raise_for_status.return_value = None
        mock_post.return_value = mock_response

        llm = LLMService()
        result = llm.generate_response(
            messages=[{"role": "user", "content": "Say hello"}],
            provider_choice="ollama",
            max_tokens=64,
        )

        self.assertEqual(result, "Local model response.")
        mock_post.assert_called_once()
        called_url = mock_post.call_args.args[0]
        called_json = mock_post.call_args.kwargs["json"]

        self.assertEqual(called_url, "http://127.0.0.1:11434/api/chat")
        self.assertEqual(called_json["model"], "deepseek-r1:8b")
        self.assertFalse(called_json["stream"])

    @patch("apps.integrations.llm_service.requests.get")
    @patch("apps.integrations.llm_service.os.environ.get")
    def test_check_ollama_health_reports_model_available(self, mock_env_get, mock_get):
        env = {
            "DEFAULT_LLM_PROVIDER": "ollama",
            "OLLAMA_BASE_URL": "http://127.0.0.1:11434",
            "OLLAMA_DEFAULT_MODEL": "deepseek-r1:8b",
        }
        mock_env_get.side_effect = lambda key, default=None: env.get(key, default)

        mock_response = Mock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {
            "models": [
                {"name": "deepseek-r1:8b"},
                {"name": "llama3.2:latest"},
            ]
        }
        mock_get.return_value = mock_response

        llm = LLMService()
        health = llm.check_ollama_health()

        self.assertTrue(health["server_reachable"])
        self.assertTrue(health["model_available"])
        self.assertIn("deepseek-r1:8b", health["available_models"])


class OllamaHealthEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.auth_user = User.objects.create_user(
            username="ollama_health_user",
            email="ollama@example.com",
            password="password123",
        )
        self.client.force_authenticate(user=self.auth_user)

    @patch("apps.integrations.views.LLMService.check_ollama_health")
    def test_ollama_health_endpoint_returns_200_when_model_ready(self, mock_health):
        mock_health.return_value = {
            "provider": "ollama",
            "base_url": "http://127.0.0.1:11434",
            "model": "deepseek-r1:8b",
            "server_reachable": True,
            "model_available": True,
            "available_models": ["deepseek-r1:8b"],
            "error": None,
        }

        response = self.client.get("/api/integrations/ollama-health/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["provider"], "ollama")

    @patch("apps.integrations.views.LLMService.check_ollama_health")
    def test_ollama_health_endpoint_returns_503_when_unavailable(self, mock_health):
        mock_health.return_value = {
            "provider": "ollama",
            "base_url": "http://127.0.0.1:11434",
            "model": "deepseek-r1:8b",
            "server_reachable": False,
            "model_available": False,
            "available_models": [],
            "error": "Connection refused",
        }

        response = self.client.get("/api/integrations/ollama-health/")

        self.assertEqual(response.status_code, 503)
        payload = response.json()
        self.assertFalse(payload["success"])
        self.assertEqual(payload["error"], "Connection refused")
