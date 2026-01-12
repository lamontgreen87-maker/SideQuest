#!/bin/bash

# Ensure we are in the right directory (repo root)
cd "$(dirname "$0")"

# Install Python Dependencies
echo ">>> Installing Dependencies..."
pip install -r backend/requirements.txt --break-system-packages

# Start Backend Server
echo ">>> Starting Server..."
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
