#!/usr/bin/env bash
# Run ONCE on the Hostinger VPS (Ubuntu). Does not install anything on your PC.
set -euo pipefail

echo "==> Installing Ollama"
curl -fsSL https://ollama.com/install.sh | sh

echo "==> Enabling service"
systemctl enable --now ollama || true

MODEL="${OLLAMA_DEFAULT_MODEL:-llama3.2:3b}"
echo "==> Pulling model: $MODEL"
ollama pull "$MODEL"

echo "==> Health check"
curl -sf http://127.0.0.1:11434/api/tags | head -c 500
echo
echo "Done. Set in backend/.env:"
echo "  OLLAMA_BASE_URL=http://127.0.0.1:11434"
echo "  OLLAMA_DEFAULT_MODEL=$MODEL"
echo "Do NOT open port 11434 on the public firewall."
