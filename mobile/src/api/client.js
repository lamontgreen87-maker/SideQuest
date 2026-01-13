import { STORAGE_KEYS } from "../config";
import { getItem } from "../storage";

async function buildHeaders(extra = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...extra,
  };
  const token = await getItem(STORAGE_KEYS.authToken, null);
  const apiKey = await getItem(STORAGE_KEYS.apiKey, null);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

export async function apiGet(baseUrl, path, timeoutMs = 600000) { // Default to 10 minutes (600,000 ms)
  const headers = await buildHeaders();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, { headers, signal: controller.signal });
    clearTimeout(id);
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(text || `GET ${path} failed`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${path} timed out after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  }
}

export async function apiPost(baseUrl, path, body, timeoutMs = 600000) { // Default to 10 minutes (600,000 ms)
  const headers = await buildHeaders();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    clearTimeout(id);
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(text || `POST ${path} failed`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${path} timed out after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  }
}

export async function apiPostText(baseUrl, path, body, timeoutMs = 600000) { // Default to 10 minutes (600,000 ms)
  const headers = await buildHeaders();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    clearTimeout(id);
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(text || `POST ${path} failed`);
      error.status = response.status;
      throw error;
    }
    return response.text();
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${path} timed out after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  }
}

import EventSource from "react-native-sse";

export function apiStream(baseUrl, path, body, callbacks) {
  const { onMessage, onError, onFinish } = callbacks;
  let es = null;

  // We need to build headers async, but EventSource is sync constructor.
  // We'll wrap the setup in an async IIFE.
  (async () => {
    try {
      const headers = await buildHeaders();
      const url = `${baseUrl}${path}`;

      es = new EventSource(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });

      es.addEventListener("open", () => {
        // connection opened
      });

      es.addEventListener("message", (event) => {
        if (!event.data) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.ready) {
            // stream starting
            return;
          }
          if (payload.done) {
            es.close();
            if (onFinish) onFinish();
            return;
          }
          if (payload.error) {
            es.close();
            if (onError) onError(new Error(payload.error));
            return;
          }
          if (payload.delta && onMessage) {
            onMessage(payload.delta);
          }
        } catch (err) {
          console.warn("Stream parse error", err);
        }
      });

      es.addEventListener("error", (event) => {
        console.warn("SSE Error", event);
        es.close();
        if (onError) onError(new Error("Stream connection failed"));
      });

    } catch (err) {
      if (onError) onError(err);
    }
  })();

  // Return a cleanup/abort function
  return () => {
    if (es) {
      es.removeAllEventListeners();
      es.close();
    }
  };
}
