# Use the official Ollama image which includes CUDA drivers
FROM ollama/ollama

# Install Python and pip for our FastAPI server
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*

# Set the working directory
 WORKDIR /app
   
    # Copy and install Python dependencies
    COPY requirements.txt .
    RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt
   
    # Copy the rest of your application code
    COPY . .
   
    # Start the server in the background, then pull the models
    RUN ollama serve & sleep 5 && \
        ollama pull qwen:7b && \
        ollama pull qwen:4b && \
        ollama pull qwen:1.8b
   
    # Expose the Ollama API port and our app's port
    EXPOSE 11434
    EXPOSE 8000
   
    # Create a script to start both services
    RUN echo '#!/bin/sh' > /entrypoint.sh && \
        echo 'ollama serve &' >> /entrypoint.sh && \
        echo 'sleep 5' >> /entrypoint.sh && \
        echo 'uvicorn main:app --host 0.0.0.0 --port 8000' >> /entrypoint.sh && \
        chmod +x /entrypoint.sh
   
    # Set the entrypoint script as the command to run
    ENTRYPOINT ["/entrypoint.sh"]