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

export async function apiGet(baseUrl, path) {
  const headers = await buildHeaders();
  const response = await fetch(`${baseUrl}${path}`, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `GET ${path} failed`);
  }
  return response.json();
}

export async function apiPost(baseUrl, path, body) {
  const headers = await buildHeaders();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `POST ${path} failed`);
  }
  return response.json();
}

export async function apiPostText(baseUrl, path, body) {
  const headers = await buildHeaders();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `POST ${path} failed`);
  }
  return response.text();
}
