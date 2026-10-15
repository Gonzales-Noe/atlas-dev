import logging
import os
import sys
import threading

from django.apps import AppConfig

logger = logging.getLogger(__name__)


def _is_web_server_process():
    argv = " ".join(sys.argv)
    if "gunicorn" in argv or "uvicorn" in argv or "daphne" in argv:
        return True
    if "runserver" in sys.argv:
        # With the autoreloader, only the child process (RUN_MAIN=true) serves requests.
        return os.environ.get("RUN_MAIN") == "true" or "--noreload" in sys.argv
    return False


def _preload_embedder():
    try:
        from .rag_service import _get_embedder
        _get_embedder()
    except Exception as exc:
        logger.warning("[ATLAS RAG] Embedding model preload skipped: %s", exc)


class IntegrationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.integrations'

    def ready(self):
        # Loading the embedding model takes ~30 s; do it once at startup instead
        # of inside the first upload/search request.
        if os.environ.get("PRELOAD_EMBEDDER", "true").lower() != "true":
            return
        if os.environ.get("EMBEDDING_PROVIDER", "local").strip().lower() != "local":
            return
        if not _is_web_server_process():
            return
        threading.Thread(target=_preload_embedder, name="embedder-preload", daemon=True).start()
