# Analysis: Django `runserver` fails with Supabase `tenant/user … not found`

**Date observed:** 2026-08-29  
**Command:** `python manage.py runserver 0.0.0.0:8000` (from `atlas-dev/backend`)  
**Symptom:** Server process starts (StatReloader, system checks pass), then crashes in the Django main thread while checking migrations.

---

## What the error says

```text
psycopg2.OperationalError: connection to server at
  "aws-0-ap-northeast-1.pooler.supabase.com" (35.79.125.133), port 5432 failed:
  FATAL: (ENOTFOUND) tenant/user postgres.dnkpupegpijryhaffgbc not found
```

### Plain-language meaning

1. Django reached a **real** Supabase shared pooler host (DNS and TCP to port `5432` worked).
2. The pooler (Supavisor) routes by **username**, not by hostname alone. Shared poolers are multi-tenant; your project is identified as `postgres.<project-ref>`.
3. Supavisor looked up tenant/user `postgres.dnkpupegpijryhaffgbc` and returned **ENOTFOUND** — that project/tenant is **not registered** on that pooler (or no longer exists / is unreachable under those credentials).

This is **not** a Django bug, migration bug, or Python package issue. System checks reported *“0 silenced”*; failure happens on the first real DB open during `check_migrations()`.

---

## How ATLAS loads the database

In `atlas/settings/base.py`:

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'atlas_dev'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'postgres'),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}
```

Local values come from `atlas-dev/backend/.env` (loaded into the environment). The values that produced this error match the traceback:

| Variable   | Role                                      | Value in use (non-secret)                          |
|-----------|--------------------------------------------|----------------------------------------------------|
| `DB_HOST` | Supabase **shared pooler** hostname        | `aws-0-ap-northeast-1.pooler.supabase.com`         |
| `DB_PORT` | Session-mode pooler port                   | `5432`                                             |
| `DB_USER` | Pooler tenant id (`postgres.<project-ref>`)| `postgres.dnkpupegpijryhaffgbc`                    |
| `DB_NAME` | Database name                              | `postgres`                                         |
| `DB_PASSWORD` | DB password                            | *(set in `.env` — do not commit)*                  |

So the app is configured for **remote Supabase Postgres via the pooler**, not local Postgres.

---

## Why this specific error appears

### Likely causes (most probable first)

1. **Supabase project no longer exists or was replaced**  
   Project ref `dnkpupegpijryhaffgbc` was deleted, or the team moved to a new project and `.env` was never updated. The pooler then correctly reports tenant not found.

2. **Project is paused (common on free tier)**  
   Inactive free projects are paused. Connections can fail until you **Resume** the project in the Supabase dashboard. (Paused projects sometimes show connection errors; verify Active/Running status first.)

3. **Stale or wrong connection details in `.env`**  
   - Wrong `DB_USER` project ref  
   - Wrong pooler host (e.g. `aws-0-…` vs the host shown in the dashboard, which can be `aws-1-…`)  
   - Password reset in Supabase but not updated in `.env`  
   - Mixing an old project ref with a new host/password  

4. **Wrong connection mode / string copied from docs**  
   Less likely here because the username **already** uses `postgres.<ref>` (the format Supavisor expects). Still verify you copy **Connect → Connection string** from *your* project, not a generic example.

### What this error is *not*

| Misdiagnosis | Why it doesn’t fit |
|--------------|--------------------|
| “Use plain `postgres` as USER” | Your USER is already `postgres.dnkpupegpijryhaffgbc`. Plain `postgres` on the pooler often causes the *same class* of error; you already have the qualified form. |
| Django / Daphne / StatReloader bug | Checks pass; crash is only on DB connect. |
| Local Postgres not running | Host is Supabase’s pooler, not `localhost`. |
| Wrong Python install path | Traceback uses global site-packages; that doesn’t cause ENOTFOUND for a tenant. |

---

## Call stack (what Django was doing)

1. `runserver` starts → system checks OK  
2. Daphne/Django calls `check_migrations()`  
3. `MigrationExecutor` opens the default DB  
4. `psycopg2` connects to the pooler with `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT`  
5. Pooler returns **FATAL: tenant/user … not found** → wrapped as `django.db.utils.OperationalError`

Until the DB connection succeeds, the API will not stay up.

---

## How to fix

### Step 1 — Confirm the Supabase project is alive

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard)  
2. Find the project whose **Reference ID** should match `dnkpupegpijryhaffgbc` (Settings → General).  
3. If the project is **missing**: create or select the correct project and update `.env` (Step 2).  
4. If the project is **Paused**: click **Resume**, wait until it is healthy, then retry `runserver`.

### Step 2 — Refresh credentials from the dashboard (do not guess)

In the Supabase project:

1. Click **Connect** (or **Project Settings → Database**).  
2. Copy values for the mode you want:

| Mode | Typical use for Django `runserver` | Port |
|------|-------------------------------------|------|
| **Session pooler** (shared) | Good default on IPv4-only networks | `5432` |
| **Transaction pooler** | Many short-lived serverless clients | `6543` |
| **Direct** `db.<ref>.supabase.co` | Persistent server with IPv6 / IPv4 add-on | `5432` |

3. Update `atlas-dev/backend/.env` to match **exactly** what the dashboard shows:

```env
DB_ENGINE=django.db.backends.postgresql
DB_NAME=postgres
DB_USER=postgres.<YOUR_CURRENT_PROJECT_REF>
DB_PASSWORD=<database password from dashboard>
DB_HOST=<exact pooler or direct host from dashboard>
DB_PORT=5432
```

**Rules:**

- On a **pooler** host (`*.pooler.supabase.com`), `DB_USER` **must** be `postgres.<project-ref>`, not bare `postgres`.  
- On a **direct** host (`db.<ref>.supabase.co`), `DB_USER` is usually `postgres`.  
- Copy the **hostname** from the dashboard; do not assume `aws-0-ap-northeast-1` if the UI shows `aws-1-…` or another region.  
- Never commit real passwords; keep them only in `.env` (gitignored).

### Step 3 — Verify connectivity before `runserver`

From `atlas-dev/backend` (with the same env Django uses):

```bash
python manage.py check
python manage.py showmigrations
```

Or use the project helper if present:

```bash
python manage.py test_db
```

Success = no `OperationalError` / no tenant ENOTFOUND.

### Step 4 — Restart the server

Stop the failed process (Ctrl+C), then:

```bash
python manage.py runserver 0.0.0.0:8000
```

You should get something like “Starting development server at http://0.0.0.0:8000/” without a migration-check traceback.

---

## Optional: develop against local Postgres instead

If you do not need the shared Supabase instance right now, point `.env` at a local database (as in `.env.example`):

```env
DB_NAME=atlas_dev
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
```

Then ensure Postgres is running locally, create the DB, and run:

```bash
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Note: local DB will not contain cloud data unless you restore a dump.

---

## Quick checklist

- [ ] Supabase project exists and status is **Active** (not paused/deleted)  
- [ ] `DB_USER` project ref matches dashboard **Reference ID**  
- [ ] `DB_HOST` / `DB_PORT` match the Connect panel (session vs transaction vs direct)  
- [ ] `DB_PASSWORD` matches current database password  
- [ ] Pooler ⇒ `postgres.<ref>`; Direct ⇒ usually `postgres`  
- [ ] `manage.py showmigrations` succeeds, then restart `runserver`

---

## Summary

| Item | Detail |
|------|--------|
| **Failure point** | First DB connection during migration check |
| **Root cause class** | Supabase pooler cannot resolve tenant `postgres.dnkpupegpijryhaffgbc` |
| **Config source** | `atlas-dev/backend/.env` → `DATABASES` in `atlas/settings/base.py` |
| **Fix** | Resume or recreate/select the correct Supabase project, then replace `DB_*` with fresh dashboard connection values (or switch to local Postgres for offline dev) |

After credentials and project status are correct, this error goes away; no application code change is required for this specific failure.

## Supabase pool client limit reached

If requests fail with `EMAXCONNSESSION` and mention that session-mode clients are
limited by `pool_size`, the session pooler has run out of client connections.
Django now closes Supabase pooler connections after each request instead of
retaining them for 60 seconds. For sustained or concurrent development traffic,
prefer the transaction pooler: set `DB_PORT=6543` in `backend/.env` using the
matching connection details from the Supabase dashboard. The backend settings
disable persistent connections and server-side cursors for transaction pooling.
Restart Django after changing the environment.
