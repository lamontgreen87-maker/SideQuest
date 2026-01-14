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
EXPOSE 22

# Install OpenSSH Server
RUN apt-get update && apt-get install -y openssh-server && \
    mkdir /var/run/sshd && \
    echo 'root:root' | chpasswd && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# Reform entrypoint
# Reform entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
