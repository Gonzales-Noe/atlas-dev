# ATLAS production on Hostinger KVM 2

**Branch:** `atlas-vps-production` (from `atlas-web-noe`)  
**Ollama:** runs **only on this VPS**, not on your Windows PC.

## Buy KVM 2?

**Yes, if** you want local embeddings + local LLM fallback off Render Free within ~1–2 weeks (especially during a promo).  
**No rush** if you will stay on Render + Cloudflare embeddings for now — finish this branch’s config first, then buy when you are ready to SSH and deploy.

KVM 2 (2 vCPU / 8 GB / 100 GB) is enough for a **pilot (~15–30 faculty)** with:

- Django + nginx frontend  
- `EMBEDDING_PROVIDER=local`  
- Ollama `llama3.2:3b` as last resort  

## Two deploy styles

### A) Native (recommended on 8 GB)

1. Ubuntu on KVM 2  
2. `bash deploy/vps/install-ollama.sh`  
3. Python venv + `pip install -r backend/requirements.txt` (full stack, not `requirements-render.txt`)  
4. Gunicorn + nginx + certbot  
5. Supabase for Postgres  

### B) Docker Compose

```bash
git clone <repo> -b atlas-vps-production /opt/atlas
cd /opt/atlas
# fill backend/.env on the server
docker compose -f docker-compose.vps.yml up -d --build
docker exec -it atlas_ollama ollama pull llama3.2:3b
```

Details for Ollama: [`OLLAMA_SETUP.md`](OLLAMA_SETUP.md).

## Required server `.env` (excerpt)

```bash
DJANGO_SETTINGS_MODULE=atlas.settings.prod
DEBUG=False
ALLOWED_HOSTS=your.domain
EMBEDDING_PROVIDER=local
LOCAL_EMBEDDING_MODEL=BAAI/bge-base-en-v1.5
DEFAULT_LLM_PROVIDER=groq
OLLAMA_BASE_URL=http://127.0.0.1:11434
# or http://ollama:11434 if using docker-compose.vps.yml
OLLAMA_DEFAULT_MODEL=llama3.2:3b
PII_MASK_NAMES=true
# + DB_*, SECRET_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, …
```

## Checklist

- [ ] Buy/activate KVM 2 + domain (free 1st year TLD if eligible)  
- [ ] Firewall: 22, 80, 443 only (not 11434)  
- [ ] Clone `atlas-vps-production`  
- [ ] Install Ollama on VPS; pull `llama3.2:3b`  
- [ ] Deploy backend/frontend; migrate  
- [ ] Test: login → upload KB → Auto AI (online) → Ollama provider once  
