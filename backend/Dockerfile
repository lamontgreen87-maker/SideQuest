# Use the official Ollama image which includes CUDA drivers
FROM ollama/ollama

# Set metadata labels for the RunPod template UI
LABEL runpod.image.displayName="SideQuest AI Server"
LABEL runpod.image.icon="https://ollama.com/public/ollama.png"
LABEL maintainer="Lamont Green <lamontgreen87@gmail.com>"

# Install Python and pip for our FastAPI server
RUN apt-get update && apt-get install -y python3 python3-pip dos2unix curl && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Set default environment variables
ENV MODEL_NAME="qwen3:4b"
ENV MODEL_FALLBACK="qwen3:8b"
ENV MODEL_HEAVY="qwen3:8b"
ENV MODEL_CLERK="qwen2.5:1.5b"
ENV DATA_DIR="/app/backend/data"
ENV OLLAMA_TIMEOUT_SECONDS="900"

# Copy and install Python dependencies
COPY backend/requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Copy the rest of your application code
COPY . .

# Start the server in the background, then pull the models
# We pre-cache the models in the image for faster starts
RUN ollama serve & sleep 5 && ollama pull qwen3:8b && pkill ollama
RUN ollama serve & sleep 5 && ollama pull qwen3:4b && pkill ollama
RUN ollama serve & sleep 5 && ollama pull qwen2.5:1.5b && pkill ollama

# Expose the Ollama API port and our app's port
EXPOSE 11434
EXPOSE 8000

# Copy and set up the entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN dos2unix /entrypoint.sh && chmod +x /entrypoint.sh

# Set the entrypoint script as the command to run
ENTRYPOINT ["/entrypoint.sh"]