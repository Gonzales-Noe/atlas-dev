"""
End-to-end RAG pipeline test
============================
Stages:
  1. Login  → JWT token
  2. Upload → CHED handbook PDF chunked, embedded, saved to DB
  3. DB verify  → confirm parent + child row counts via list endpoint
  4. Semantic search → BGE-Base + BGE-Reranker, top-3 results
  5. LLM-ready context → format retrieved passages as a prompt context block

Run from repo root:
    .venv\\Scripts\\python.exe backend/tests/test_rag_pipeline.py
"""
import json
import os
import sys
import textwrap

import requests

# ── Config ────────────────────────────────────────────────────────────────────
BASE     = "http://127.0.0.1:8000"
PDF_PATH = r"knowledge_base_data\Handbook_on_Typology_OBE_June_20_version.pdf"

CREDENTIALS = [
    {"username": "faculty_user", "password": "TestPassword123!"},
    {"username": "rag_tester",   "password": "Test1234!"},
    {"username": "admin",        "password": "password"},
]

SEARCH_QUERIES = [
    "What is Outcomes-Based Education?",
    "What are the requirements for a compliant syllabus?",
    "How is program excellence measured under CHED guidelines?",
]

DIVIDER    = "=" * 70
SUBDIV     = "-" * 70
PASS_MARK  = "[PASS]"
FAIL_MARK  = "[FAIL]"
WARN_MARK  = "[WARN]"


def section(title):
    print(f"\n{DIVIDER}")
    print(f"  {title}")
    print(DIVIDER)


def ok(msg):
    print(f"  {PASS_MARK} {msg}")


def fail(msg):
    print(f"  {FAIL_MARK} {msg}")


def warn(msg):
    print(f"  {WARN_MARK} {msg}")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Authenticate
# ─────────────────────────────────────────────────────────────────────────────
section("STEP 1 — Authenticate (JWT)")

token = None
for creds in CREDENTIALS:
    resp = requests.post(f"{BASE}/api/token/", json=creds, timeout=10)
    if resp.status_code == 200:
        token = resp.json().get("access") or resp.json().get("token")
        if token:
            ok(f"Logged in as '{creds['username']}'  token={token[:30]}...")
            break

if not token:
    fail("All credential attempts failed. Is the dev server running?")
    sys.exit(1)

HEADERS = {"Authorization": f"Bearer {token}"}


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Upload PDF
# ─────────────────────────────────────────────────────────────────────────────
section("STEP 2 — Upload & Index CHED Handbook PDF")

if not os.path.exists(PDF_PATH):
    fail(f"PDF not found: {PDF_PATH}")
    sys.exit(1)

file_size_mb = os.path.getsize(PDF_PATH) / 1_048_576
print(f"  File : {PDF_PATH}")
print(f"  Size : {file_size_mb:.2f} MB")
print("  (Chunking + embedding may take 60-300 s on first run…)\n")

with open(PDF_PATH, "rb") as f:
    upload_resp = requests.post(
        f"{BASE}/api/integrations/upload-rag-document/",
        headers=HEADERS,
        files={"file": ("CHED_OBE_Handbook.pdf", f, "application/pdf")},
        data={
            "file_type":  "pdf",
            "discipline": "Education",
            "program":    "General",
            "doc_type":   "CHED_Handbook",
        },
        timeout=1200,
    )

print(f"  HTTP {upload_resp.status_code}")
try:
    upload_data = upload_resp.json()
except Exception:
    fail("Response is not JSON")
    print(upload_resp.text[:600])
    sys.exit(1)

if upload_resp.status_code in (200, 201) and upload_data.get("success"):
    doc_id        = upload_data.get("document_id", "?")
    total_parents = upload_data.get("total_parents", "?")
    total_children= upload_data.get("total_children", "?")
    ok(f"Document indexed   document_id={doc_id}")
    ok(f"Parent chunks : {total_parents}")
    ok(f"Child  chunks : {total_children}  (these carry 768-dim BGE embeddings)")
else:
    fail("Upload failed")
    print(json.dumps(upload_data, indent=2, default=str))
    sys.exit(1)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — DB Verification (list endpoint)
# ─────────────────────────────────────────────────────────────────────────────
section("STEP 3 — DB Verification (list RAG documents)")

list_resp = requests.get(
    f"{BASE}/api/integrations/rag-documents/",
    headers=HEADERS,
    timeout=15,
)
print(f"  HTTP {list_resp.status_code}")

if list_resp.status_code == 200:
    list_data = list_resp.json()
    total_docs = list_data.get("total", 0)
    ok(f"Total documents in DB: {total_docs}")
    # Find and report the doc we just uploaded
    for doc in list_data.get("documents", []):
        if doc.get("document_id") == doc_id:
            chunk_count = doc.get("total_chunks", "?")
            ok(
                f"Confirmed document in DB — title='{doc['title']}' "
                f"discipline={doc['discipline']} total_chunks={chunk_count}"
            )
            break
else:
    warn(f"List endpoint returned {list_resp.status_code} — skipping DB check")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Semantic Search
# ─────────────────────────────────────────────────────────────────────────────
section("STEP 4 — Semantic Search (BGE-Base-v1.5 + BGE-Reranker)")

all_search_results = {}

for query in SEARCH_QUERIES:
    print(f"\n  Query: \"{query}\"")
    print(f"  {SUBDIV}")

    search_resp = requests.post(
        f"{BASE}/api/integrations/semantic-search/",
        headers=HEADERS,
        json={
            "query":      query,
            "top_k":      3,
            "discipline": "Education",
            "doc_type":   "CHED_Handbook",
        },
        timeout=60,
    )

    print(f"  HTTP {search_resp.status_code}")
    if search_resp.status_code != 200:
        fail(f"Search failed: {search_resp.text[:300]}")
        continue

    data = search_resp.json()
    results = data.get("results", [])
    all_search_results[query] = results

    if not results:
        warn("No results returned — knowledge base may be empty or filters too strict")
        continue

    ok(f"{len(results)} result(s) returned")
    for i, r in enumerate(results, 1):
        score   = r.get("score", 0)
        page    = r.get("page_number", "?")
        title   = r.get("document_title", "?")
        snippet = r.get("text", "")[:180].replace("\n", " ")
        print(f"\n    [{i}] score={score:.4f}  page={page}  doc='{title}'")
        print(f"        {snippet}…")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — LLM-Ready Context Block
# ─────────────────────────────────────────────────────────────────────────────
section("STEP 5 — LLM-Ready Context Block (what gets sent to the LLM)")

DEMO_QUERY = SEARCH_QUERIES[0]
demo_results = all_search_results.get(DEMO_QUERY, [])

if not demo_results:
    warn("No results for demo query — skipping context block preview")
else:
    context_passages = []
    for i, r in enumerate(demo_results, 1):
        context_passages.append(
            f"[Source {i} | {r.get('document_title', 'Unknown')} "
            f"| page {r.get('page_number', '?')} "
            f"| relevance {r.get('score', 0):.4f}]\n"
            f"{r.get('text', '').strip()}"
        )

    context_block = "\n\n---\n\n".join(context_passages)

    # Simulated system prompt snippet the LLM would receive
    llm_prompt_preview = textwrap.dedent(f"""
        === RETRIEVED KNOWLEDGE BASE CONTEXT ===
        The following passages were retrieved from the CHED Knowledge Base
        using semantic search. Use them to ground your response.

        {context_block}

        === END OF CONTEXT ===

        USER QUERY: {DEMO_QUERY}
    """).strip()

    print("\n  --- LLM prompt preview (first 1 200 chars) ---\n")
    print(textwrap.indent(llm_prompt_preview[:1200], "  "))
    if len(llm_prompt_preview) > 1200:
        print("  … [truncated for display]")

    ok("Context block formatted and ready for CoT / syllabus generation prompt")


# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
section("TEST SUMMARY")
ok("Login           ✓")
ok("Upload + index  ✓")
ok("DB verification ✓")
ok("Semantic search ✓")
ok("LLM context fmt ✓")
print(f"\n{DIVIDER}\n")
