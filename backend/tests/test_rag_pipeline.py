"""
End-to-end RAG pipeline test:
  1. Login → get JWT
  2. Upload CHED handbook PDF
  3. Semantic search for two queries
"""
import requests
import json
import os

BASE = "http://127.0.0.1:8000"
PDF_PATH = r"knowledge_base_data\Handbook_on_Typology_OBE_June_20_version.pdf"

# ── 1. Login ──────────────────────────────────────────────────────────────────
print("=" * 60)
print("STEP 1: Getting JWT token")
print("=" * 60)

login_resp = requests.post(
    f"{BASE}/api/token/",
    json={"username": "rag_tester", "password": "Test1234!"},
    timeout=10,
)
if login_resp.status_code != 200:
    # Try alternate credentials
    login_resp = requests.post(
        f"{BASE}/api/token/",
        json={"username": "admin", "password": "password"},
        timeout=10,
    )

print(f"Status: {login_resp.status_code}")
if login_resp.status_code != 200:
    print("Login failed – trying to list users to find valid credentials")
    print(login_resp.text[:300])
    exit(1)

token = login_resp.json().get("access")
if not token:
    token = login_resp.json().get("token")

print(f"Token obtained: {token[:30]}...")
HEADERS = {"Authorization": f"Bearer {token}"}

# ── 2. Upload PDF ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("STEP 2: Uploading CHED Handbook PDF")
print("=" * 60)

if not os.path.exists(PDF_PATH):
    print(f"ERROR: PDF not found at {PDF_PATH}")
    exit(1)

print(f"File size: {os.path.getsize(PDF_PATH):,} bytes")

with open(PDF_PATH, "rb") as f:
    upload_resp = requests.post(
        f"{BASE}/api/integrations/upload-rag-document/",
        headers=HEADERS,
        files={"file": ("CHED_OBE_Handbook.pdf", f, "application/pdf")},
        data={"file_type": "pdf", "course_name": "CHED OBE Handbook 2014"},
        timeout=300,  # PDF chunking + embedding takes time
    )

print(f"Status: {upload_resp.status_code}")
try:
    upload_data = upload_resp.json()
    print(json.dumps(upload_data, indent=2, default=str))
except Exception:
    print(upload_resp.text[:500])

if upload_resp.status_code not in (200, 201):
    print("Upload failed – aborting.")
    exit(1)

total_chunks = upload_data.get("total_chunks", "?")
print(f"\n✓ Uploaded {total_chunks} chunks")

# ── 3. Semantic Search ────────────────────────────────────────────────────────
queries = [
    "What is Outcomes-Based Education?",
    "What are requirements for syllabus",
    "How is program excellence measured?",
]

for query in queries:
    print("\n" + "=" * 60)
    print(f"STEP 3: Semantic Search — '{query}'")
    print("=" * 60)

    search_resp = requests.post(
        f"{BASE}/api/integrations/semantic-search/",
        headers=HEADERS,
        json={"query": query, "top_k": 3},
        timeout=30,
    )

    print(f"Status: {search_resp.status_code}")
    if search_resp.status_code == 200:
        data = search_resp.json()
        for i, result in enumerate(data.get("results", []), 1):
            score = result.get("score", 0)
            page = result.get("page_number", "?")
            snippet = result["text_content"][:200].replace("\n", " ")
            print(f"\n  [{i}] score={score:.4f}  page={page}")
            print(f"      {snippet}...")
    else:
        print(search_resp.text[:400])

print("\n" + "=" * 60)
print("TEST COMPLETE")
print("=" * 60)
