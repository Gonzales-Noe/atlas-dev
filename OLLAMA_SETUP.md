# Ollama on the VPS (not on your PC)

ATLAS does **not** need Ollama on your laptop. Online free models (Groq, OpenRouter, …) run from anywhere. Ollama runs **only on the Hostinger VPS** as a last-resort local LLM when those APIs fail or when a user picks **Ollama**.

## How ATLAS talks to it

| Setting | VPS value |
|---------|-----------|
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` (same machine as Django) |
| `OLLAMA_DEFAULT_MODEL` | `llama3.2:3b` (fits KVM 2 / 8 GB with Django + embeddings) |
| `DEFAULT_LLM_PROVIDER` | `groq` (online first) |

With provider **Auto**, ATLAS tries the free online chain, then Ollama if it is up on the VPS.

Your PC only needs a browser. No `ollama` install on Windows.

---

## Install on Hostinger KVM 2 (Ubuntu) — recommended

SSH into the VPS, then:

```bash
# 1) Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2) Pull a small model (do this once; ~2 GB download)
ollama pull llama3.2:3b

# 3) Confirm (localhost only — do not expose 11434 to the public internet)
curl http://127.0.0.1:11434/api/tags
ollama run llama3.2:3b "Reply with OK only."
```

Ollama’s install script usually registers a systemd service (`ollama`). Check:

```bash
systemctl status ollama
systemctl enable --now ollama
```

### Bind to localhost only

Keep the API private to Django on the same VPS. If you ever set `OLLAMA_HOST=0.0.0.0`, put a firewall deny on port `11434` from the public internet.

---

## Django env on the VPS

In the server’s `backend/.env` (never commit secrets):

```bash
DEFAULT_LLM_PROVIDER=groq
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_DEFAULT_MODEL=llama3.2:3b
EMBEDDING_PROVIDER=local
LOCAL_EMBEDDING_MODEL=BAAI/bge-base-en-v1.5
```

Restart Gunicorn after editing `.env`.

---

## Optional: Docker Compose on the VPS

See `docker-compose.vps.yml` — includes an `ollama` service on the internal Docker network. Use this only if you deploy the whole stack with Compose. On KVM 2, a **native** Ollama install + systemd Gunicorn often leaves more RAM free.

```bash
docker compose -f docker-compose.vps.yml up -d ollama
docker exec -it atlas_ollama ollama pull llama3.2:3b
```

Backend env when Ollama is in Compose:

```bash
OLLAMA_BASE_URL=http://ollama:11434
```

---

## Smoke test from the VPS (after Django is up)

```bash
cd /opt/atlas/backend   # or your app path
source ../.venv/bin/activate
python -c "
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE','atlas.settings.prod')
django.setup()
from apps.integrations.llm_service import LLMService
s = LLMService()
print('available', s.is_ollama_available())
print(s.generate_response([{'role':'user','content':'Reply OK'}], provider_choice='ollama', max_tokens=8))
"
```

---

## RAM budget (KVM 2 / 8 GB)

| Process | Rough RAM |
|---------|-----------|
| OS + nginx | ~0.5–1 GB |
| Django / Gunicorn | ~0.5–1.5 GB |
| Local BGE embeddings | ~1–1.5 GB |
| Ollama `llama3.2:3b` | ~2–3 GB |

Do **not** pull `deepseek-r1:8b` or other 7B+ models on KVM 2 if Django + embeddings share the same box.
