"""
Download BAAI/bge-base-en-v1.5 model, bypassing HF's XET client which fails on this network.
- Small files: snapshot_download with large files ignored
- model.safetensors: direct urllib streaming (follows XET redirect via plain HTTP)
"""
import os, sys, urllib.request, time, hashlib

HF_CACHE = os.path.expanduser("~/.cache/huggingface/hub/models--BAAI--bge-base-en-v1.5")
SNAPSHOT_REV = "a5beb1e3e68b9ab74eb54cfd186867f64f240e1a"
BLOB_SHA = "c7c1988aae201f80cf91a5dbbd5866409503b89dcaba877ca6dba7dd0a5167d7"
BLOB_PATH = os.path.join(HF_CACHE, "blobs", BLOB_SHA)
SNAP_PATH = os.path.join(HF_CACHE, "snapshots", SNAPSHOT_REV, "model.safetensors")
INCOMPLETE = BLOB_PATH + ".incomplete_dl"  # our own temp file (not HF's .incomplete)
TOTAL_SIZE = 437955512  # bytes

# ── Step 1: small files via snapshot_download ──────────────────────────────
print("=" * 60)
print("Step 1: downloading small config/tokenizer files...")
from huggingface_hub import snapshot_download
snapshot_download(
    "BAAI/bge-base-en-v1.5",
    ignore_patterns=["*.safetensors", "*.bin", "*.onnx", ".gitattributes"],
)
print("Small files done.")

# ── Step 2: download model.safetensors via streaming urllib ───────────────
print("=" * 60)
existing_size = 0
if os.path.exists(INCOMPLETE):
    existing_size = os.path.getsize(INCOMPLETE)
    print(f"Resuming from {existing_size / 1024 / 1024:.1f} MB ({existing_size / TOTAL_SIZE * 100:.1f}%)")
elif os.path.exists(BLOB_PATH):
    sz = os.path.getsize(BLOB_PATH)
    if sz == TOTAL_SIZE:
        print(f"model.safetensors already downloaded ({sz} bytes). Skipping.")
    else:
        print(f"Blob exists but wrong size ({sz}), re-downloading.")
    if sz == TOTAL_SIZE:
        # Just make sure snapshot symlink exists
        if not os.path.exists(SNAP_PATH):
            os.symlink(BLOB_PATH, SNAP_PATH)
            print("Created snapshot symlink.")
        sys.exit(0)

print("Downloading model.safetensors (438 MB) via urllib...")
URL = "https://hf-mirror.com/BAAI/bge-base-en-v1.5/resolve/main/model.safetensors"
headers = {"User-Agent": "python-urllib/download-script"}
if existing_size > 0:
    headers["Range"] = f"bytes={existing_size}-"

req = urllib.request.Request(URL, headers=headers)
resp = urllib.request.urlopen(req, timeout=120)

mode = "ab" if existing_size > 0 else "wb"
downloaded = existing_size
start = time.time()
last_print = start

with open(INCOMPLETE, mode) as f:
    while True:
        chunk = resp.read(1024 * 256)  # 256 KB chunks
        if not chunk:
            break
        f.write(chunk)
        downloaded += len(chunk)
        now = time.time()
        if now - last_print >= 10:
            elapsed = now - start
            rate = (downloaded - existing_size) / elapsed / 1024
            pct = downloaded / TOTAL_SIZE * 100
            eta = (TOTAL_SIZE - downloaded) / ((downloaded - existing_size) / elapsed) if downloaded > existing_size else 0
            print(f"  {pct:.1f}%  {downloaded//1024//1024} MB  {rate:.0f} KB/s  ETA {eta/60:.0f} min")
            sys.stdout.flush()
            last_print = now

resp.close()
final_size = os.path.getsize(INCOMPLETE)
print(f"Download complete: {final_size} bytes")

if final_size != TOTAL_SIZE:
    print(f"WARNING: expected {TOTAL_SIZE}, got {final_size}")
    sys.exit(1)

# ── Step 3: move to blob location ─────────────────────────────────────────
print("Moving to blob location...")
if os.path.exists(BLOB_PATH):
    os.remove(BLOB_PATH)
os.rename(INCOMPLETE, BLOB_PATH)
print(f"Blob saved: {BLOB_PATH}")

# Remove .incomplete files left by HF library
for fn in [BLOB_PATH + ".incomplete",
           os.path.join(HF_CACHE, "blobs",
               "4b9d4a4b2d7ab06e3861861d5ee370974b31d17c0bb6af6f13d3dc79f33bbdcd.incomplete")]:
    if os.path.exists(fn):
        os.remove(fn)

# ── Step 4: create snapshot symlink ───────────────────────────────────────
os.makedirs(os.path.dirname(SNAP_PATH), exist_ok=True)
if os.path.islink(SNAP_PATH) or os.path.exists(SNAP_PATH):
    os.remove(SNAP_PATH)
os.symlink(BLOB_PATH, SNAP_PATH)
print(f"Snapshot symlink: {SNAP_PATH}")

# ── Step 5: quick sanity check ────────────────────────────────────────────
print("=" * 60)
print("Verifying model loads...")
from sentence_transformers import SentenceTransformer
m = SentenceTransformer("BAAI/bge-base-en-v1.5")
dim = m.get_sentence_embedding_dimension()
print(f"SUCCESS: dim={dim}")
