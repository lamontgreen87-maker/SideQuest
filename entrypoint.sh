#!/bin/sh

# Start Ollama in the background
ollama serve &
OLLAMA_PID=$!

# Give Ollama a few seconds to be ready
sleep 5

# Pull required models (optional – you can skip if models are already present)
# Pull required models (optional – you can skip if models are already present)
ollama pull qwen3:8b || true
ollama pull qwen3:4b || true
ollama pull qwen2.5:1.5b || true

# Wait for Ollama to be fully ready (simple health check loop)
while ! curl -s http://127.0.0.1:11434/api/tags > /dev/null; do
  echo "Waiting for Ollama to be ready..."
  sleep 1
done

echo "Ollama is ready. Starting FastAPI..."

# Start FastAPI (foreground) – this will keep the container alive
cd /app/backend && exec uvicorn main:app --host 0.0.0.0 --port 8000
