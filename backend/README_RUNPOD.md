# SideQuest AI Server - RunPod Template Guide

Follow these steps to create a public RunPod template for your AI server.

## 1. Create a New Template
In the RunPod dashboard, go to **Templates** -> **New Template**.

### Basic Settings
- **Template Name**: `SideQuest AI Server`
- **Container Image**: `your-docker-username/sidequest-backend:latest` (Replace with your actual image path)
- **Container Disk**: `20 GB` (Enough for cached models + OS)
- **Volume Disk**: `10 GB` (Used for persistent character/session data)
- **Volume Mount Path**: `/app/backend/data`

### Port Settings
- **Expose HTTP**: `8000` (The FastAPI game engine)
- **Expose TCP**: `11434` (Ollama API - optional but useful for debugging)

## 2. Environment Variables
The image comes with sensible defaults, but you can override them here:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `MODEL_NAME` | `qwen:4b` | The primary storyteller model. |
| `MODEL_CLERK` | `qwen:1.8b` | The faster model for state updates. |
| `MODEL_HEAVY` | `qwen:7b` | The deep model for backstories/world gen. |
| `API_KEY` | (Empty) | Set this to secure your server. |

## 3. Public Sharing
1. Once the template is saved, you can click **Share** on the template card.
2. Provide the link to testers.
3. They can simply click the link, choose a GPU (RTX 3090/4090 recommended), and the server will be up and running in minutes.

---
*Note: The first launch takes about 30 seconds for Ollama to initialize the pre-cached models.*
