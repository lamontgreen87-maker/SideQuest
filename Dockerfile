# Use the official Ollama image which includes CUDA drivers
FROM ollama/ollama

# Install Python and pip for our FastAPI server
RUN apt-get update && apt-get install -y python3 python3-pip curl dos2unix && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy backend requirements and install them
COPY backend/requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Copy only the backend code needed for the server
COPY backend ./backend
EXPOSE 11434
EXPOSE 8000

# Create a script to start both services
# Copy the entrypoint script
# Reform entrypoint using printf to guarantee unix line endings
RUN printf "#!/bin/sh\n\
    \n\
    # Start Ollama in the background\n\
    ollama serve &\n\
    OLLAMA_PID=\$!\n\
    \n\
    # Give Ollama a few seconds to be ready\n\
    sleep 5\n\
    \n\
    # Pull required models\n\
    ollama pull qwen2.5:7b || true\n\
    ollama pull qwen2.5:3b || true\n\
    ollama pull qwen2.5:1.5b || true\n\
    \n\
    # Wait for Ollama to be fully ready\n\
    while ! curl -s http://127.0.0.1:11434/api/tags > /dev/null; do\n\
    echo \"Waiting for Ollama to be ready...\"\n\
    sleep 1\n\
    done\n\
    \n\
    echo \"Ollama is ready. Starting FastAPI...\"\n\
    cd /app/backend && exec uvicorn main:app --host 0.0.0.0 --port 8000\n" > /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
