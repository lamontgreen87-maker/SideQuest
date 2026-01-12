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
      throw new Error(text || `GET ${path} failed`);
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
      throw new Error(text || `POST ${path} failed`);
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
      throw new Error(text || `POST ${path} failed`);
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
