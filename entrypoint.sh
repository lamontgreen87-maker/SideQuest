#!/bin/sh

# Setup SSH
mkdir -p /var/run/sshd
mkdir -p /root/.ssh
chmod 700 /root/.ssh

# Inject RunPod Public Key if available
if [ ! -z "$PUBLIC_KEY" ]; then
  echo "$PUBLIC_KEY" >> /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
fi

# Start SSH service
/usr/sbin/sshd -D &

# Start Ollama in the background
ollama serve &
OLLAMA_PID=$!

# Give Ollama a few seconds to be ready
sleep 5

# Pull required models
ollama pull qwen2.5:7b || true
ollama pull qwen2.5:3b || true
ollama pull qwen2.5:1.5b || true

# Wait for Ollama to be fully ready
while ! curl -s http://127.0.0.1:11434/api/tags > /dev/null; do
  echo "Waiting for Ollama to be ready..."
  sleep 1
done

echo "Ollama is ready. Starting FastAPI..."
cd /app/backend && exec uvicorn main:app --host 0.0.0.0 --port 8000
