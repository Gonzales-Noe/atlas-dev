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

## Google Sign-In (must not point at Render)

Google Identity Services only allows origins listed in Google Cloud Console.
If Sign-In still fails or seems tied to Render, update the OAuth **Web client**:

1. Open [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Open the OAuth 2.0 Client ID used by ATLAS  
   (`…lt31psljafm1en4n3aajo054thn5kfin.apps.googleusercontent.com` or your web client)
3. Under **Authorized JavaScript origins**, add:
   - `https://atlas-ph.tech`
   - `https://www.atlas-ph.tech`
4. Under **Authorized redirect URIs**, add (if the form requires any):
   - `https://atlas-ph.tech`
   - `https://www.atlas-ph.tech`
5. You may keep old Render origins for a while, or remove them after cutover
6. Save, wait 1–5 minutes, hard-refresh the site

Rebuild the frontend so the API is **same-origin** (not Render):

```bash
cd /opt/atlas
echo 'VITE_API_URL=/api' > .env
git pull origin atlas-vps-production
docker compose -f docker-compose.vps.yml up -d --build frontend
```

Backend `GOOGLE_OAUTH_CLIENT_IDS` in `backend/.env` must include that same client ID.

## Checklist

- [ ] Buy/activate KVM 2 + domain (free 1st year TLD if eligible)  
- [ ] Firewall: 22, 80, 443 only (not 11434)  
- [ ] Clone `atlas-vps-production`  
- [ ] Install Ollama on VPS; pull `llama3.2:3b`  
- [ ] Deploy backend/frontend; migrate  
- [ ] Google OAuth origins include `https://atlas-ph.tech`  
- [ ] Frontend rebuilt with `VITE_API_URL=/api`  
- [ ] Test: Google Sign-In → upload KB → Auto AI → Ollama once  
