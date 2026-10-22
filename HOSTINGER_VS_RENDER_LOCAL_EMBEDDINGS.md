# Hostinger VPS vs Render — Local Embeddings for ATLAS RAG

**Question:** If ATLAS moves from Render to Hostinger VPS **KVM 2**, can it run the local embedding model (`BAAI/bge-base-en-v1.5`) for RAG? How does cost compare to the Render plan that would be needed for the same setup?

**Short answer:** Yes — **Hostinger KVM 2 is more than enough** for disk and RAM to store and run the local embedding model. On Render, the free / starter tiers are not; you need a paid plan with at least ~4 GB RAM (safer: 8 GB), which costs far more per month than KVM 2.

---

## What “local embeddings” actually need

ATLAS uses **`BAAI/bge-base-en-v1.5`** (768-dim vectors) via `sentence-transformers` + PyTorch when `EMBEDDING_PROVIDER=local`.

| Resource | Rough requirement | Why |
|----------|-------------------|-----|
| **Disk (model weights)** | ~440 MB–1 GB | `model.safetensors` ≈ 438 MB; tokenizer + configs push the cache toward ~1 GB |
| **Disk (runtime stack)** | ~1.5–3 GB extra | PyTorch / torch CPU wheels, `sentence-transformers`, Hugging Face cache |
| **Disk (app + OS headroom)** | several GB more | Django, Gunicorn, logs, uploads, OS packages |
| **RAM (loaded model)** | ~0.9–1.5 GB | Weights + activations for BGE-base on CPU |
| **RAM (full process)** | **~2–4 GB peak** | Model + PyTorch + Django workers + batch encoding of a syllabus |
| **Comfortable total RAM** | **≥ 4 GB**, prefer **8 GB** | Leaves room for web traffic, Celery/workers, OS, and concurrent uploads |

**Disk is not the hard part.** The model itself is under 1 GB. **RAM is the hard part** — Render Free (512 MB) OOM-kills the process; that is why the Render deploy currently uses Cloudflare / Hugging Face APIs instead of local PyTorch.

---

## Hostinger KVM 2 — does it suffice?

From Hostinger’s VPS pricing (24‑month promo pricing you shared):

| Spec | KVM 2 |
|------|--------|
| vCPU | **2 cores** |
| RAM | **8 GB** |
| Disk | **100 GB NVMe** |
| Bandwidth | **8 TB** |
| Promo price | **₱529 / mo** (first term; listed was ₱1,429) |
| Renewal (stated) | **₱819 / mo** for 2 years |

### Verdict for local RAG

| Need | KVM 2 | Fit? |
|------|--------|------|
| Store model (~1 GB) | 100 GB disk | **Yes, easily** |
| Install PyTorch + deps (~2–3 GB) | 100 GB disk | **Yes** |
| Keep model in RAM + Django | 8 GB RAM | **Yes — comfortable** |
| Index syllabi (batch encode) | 2 vCPU | **Yes** (CPU-only; slower than GPU, fine for document uploads) |

**KVM 2 is sufficient for local embeddings.** Even **KVM 1** (4 GB RAM / 50 GB disk) would likely *fit* the model if the app is tuned carefully (one Gunicorn worker, no heavy concurrent indexing), but **KVM 2 is the safer choice** so RAG indexing does not fight the web process for memory.

You would set on the VPS:

```bash
EMBEDDING_PROVIDER=local
LOCAL_EMBEDDING_MODEL=BAAI/bge-base-en-v1.5
```

and install the full backend requirements (including `torch` / `sentence-transformers`), not the slim `requirements-render.txt`.

---

## Render — what plan is needed for the same local RAG?

Current Render web-service compute (from [Render pricing](https://render.com/pricing) / compute plans):

| Plan ID | CPU | RAM | Price (USD/mo) | Local BGE embeddings? |
|---------|-----|-----|----------------|------------------------|
| `free` | 0.1 | **512 MB** | $0 | **No** — OOM / no PyTorch stack |
| `0.5c-512mb` (Starter) | 0.5 | **512 MB** | **$7** | **No** |
| `1c-2g` (Standard) | 1 | **2 GB** | **$25** | **Risky / often too tight** once Django + PyTorch + model load |
| `2c-4g` (Pro) | 2 | **4 GB** | **$85** | **Minimum realistic** for local RAG |
| `2c-8g` | 2 | **8 GB** | **$135** | **Comfortable** (closest match to Hostinger KVM 2 RAM) |

**Also note Render Free sleeps** after idle time; cold starts + reloading the embedding model make uploads feel broken. Paid plans stay awake.

ATLAS on Render today avoids this by using **hosted** embeddings (`cloudflare` / `huggingface`) and `requirements-render.txt` (no torch). That works on Free/Starter **RAM**, but depends on API credits/quotas.

---

## Price comparison (same job: run local embeddings)

Assumptions:

- Backend only (Django API). Frontend can stay static hosting or on the same VPS.
- Database stays on **Supabase** (current setup) — DB cost is **outside** both columns below.
- FX for Hostinger: approximate **₱58 ≈ $1** (round numbers; check live rates). Prices exclude VAT where Hostinger notes “Prices are listed without VAT.”

### Monthly cost to run local `bge-base` embeddings

| Option | Specs relevant to RAG | Monthly cost | Approx. USD | Fit for local embeddings |
|--------|------------------------|--------------|-------------|---------------------------|
| **Hostinger KVM 2 (promo)** | 2 vCPU / **8 GB** / 100 GB | **₱529** | **~$9** | Yes |
| **Hostinger KVM 2 (renewal)** | same | **₱819** | **~$14** | Yes |
| **Hostinger KVM 2 (list / full)** | same | **₱1,429** | **~$25** | Yes |
| **Render Free / Starter** | 512 MB | $0–$7 | $0–$7 | **No** (use API embeddings instead) |
| **Render `1c-2g`** | 2 GB | **$25** | $25 | Borderline / not recommended |
| **Render `2c-4g` (min for local)** | 4 GB | **$85** | $85 | Yes (tight) |
| **Render `2c-8g` (≈ KVM 2 RAM)** | 8 GB | **$135** | $135 | Yes |

### Rough yearly comparison (backend compute only)

| Option | ~Year 1 | Notes |
|--------|---------|--------|
| Hostinger KVM 2 @ ₱529/mo | **~₱6,350** (~$110) | Promo assumes long prepaid term; confirm checkout total |
| Hostinger KVM 2 @ ₱819/mo | **~₱9,830** (~$170) | Stated renewal rate |
| Render `2c-4g` | **~$1,020** | Minimum realistic for local torch embeddings |
| Render `2c-8g` | **~$1,620** | Same RAM class as KVM 2 |

**Bottom line on price:** for the *same capability* (local embedding model on the server), **Hostinger KVM 2 is an order of magnitude cheaper** than the Render plan that safely matches it (~8 GB RAM). Render only looks “cheap” if you stay on Free and keep using **Cloudflare / Hugging Face** APIs instead of local models.

---

## Side-by-side (not only money)

| Factor | Hostinger KVM 2 | Render (paid, local embeddings) |
|--------|-----------------|----------------------------------|
| **Local BGE model** | Fits easily | Needs `2c-4g`+ ($85+) |
| **Disk for model** | 100 GB — plenty | Ephemeral disk unless you add persistent disk ($0.25/GB/mo); model re-downloads on redeploy unless cached carefully |
| **Ops burden** | You manage OS, nginx/Caddy, SSL, firewall, updates, process manager | Deploy from Git; less server admin |
| **Sleep / cold start** | Always on | Free sleeps; paid stays up |
| **Scaling** | Vertical (upgrade KVM plan) | Click plan / scale instances |
| **PyTorch install** | Full control; install `torch` CPU wheels | Large Docker image; longer builds; need enough RAM at runtime |
| **Current ATLAS path** | Switch to `EMBEDDING_PROVIDER=local` | Keep `cloudflare,huggingface` on Free, or upgrade + change requirements |

---

## Recommendation for ATLAS

1. **If the goal is free/cheap hosting and you accept API embeddings:** stay on **Render Free** + `EMBEDDING_PROVIDER=cloudflare,huggingface` (what you are setting up now). No VPS required.
2. **If the goal is local embeddings with no HF/Cloudflare credit limits:** **Hostinger KVM 2 is enough** for storage and RAM, and much cheaper than Render’s 4–8 GB plans.
3. **KVM 1 (4 GB)** might work for a light single-user demo; **prefer KVM 2** for real faculty uploads + web traffic together.
4. Moving to a VPS means you (or a setup script) must handle: Ubuntu, Docker or systemd, HTTPS, env vars, backups, and keeping Supabase reachable from the VPS IP.

---

## Copy-paste env for VPS local RAG

```
EMBEDDING_PROVIDER=local
LOCAL_EMBEDDING_MODEL=BAAI/bge-base-en-v1.5
```

Do **not** use `requirements-render.txt` on the VPS; use the full backend requirements that include `sentence-transformers` / torch.

---

## Sources

- Hostinger VPS pricing (user-provided screenshot / page): KVM 2 = 2 vCPU, 8 GB RAM, 100 GB NVMe; promo ₱529/mo, renews ₱819/mo (24‑month context).
- Render compute pricing: [render.com/pricing](https://render.com/pricing), [compute plans](https://render.com/docs/compute-plans).
- Model size: Hugging Face `BAAI/bge-base-en-v1.5` — ~438 MB weights; ~109M parameters, 768-dim.

*Prices change; re-check Hostinger checkout and Render’s pricing page before purchasing. FX rate used for USD estimates only.*
