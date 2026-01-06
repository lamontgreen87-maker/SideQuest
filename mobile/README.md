# Dungeon Crawler Mobile (Expo)

This is a simple native mobile app (Expo/React Native) that talks to your local
FastAPI backend and runs a D&D-style chat.

## Setup

1) Install Node.js (LTS).
2) From this folder, install dependencies:

```powershell
npm install
```

3) Set your backend IP in `mobile/App.js`:

```js
const BASE_URL = "http://YOUR_PC_IP:8000";
```

Use your PC's LAN IP (not 127.0.0.1). Example: `http://192.168.1.25:8000`.

4) Start the app:

```powershell
npm run start
```

## Run On Your Phone

- Install the Expo Go app on your phone.
- Make sure the phone and PC are on the same Wi-Fi.
- Scan the QR code that appears after `npm run start`.

## Backend Requirements

- Your FastAPI server must be running:
  `uvicorn main:app --host 0.0.0.0 --port 8000`
- Model should be set via `MODEL_NAME` in the backend terminal.
