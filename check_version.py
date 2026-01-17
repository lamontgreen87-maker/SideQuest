import requests
import json

base_url = "https://fwsq4lc2rmq66k-8000.proxy.runpod.net"
print(f"Checking {base_url}/health...")
try:
    health_resp = requests.get(f"{base_url}/health")
    print(f"Health Status: {health_resp.status_code}")
    print(f"Health Body: {health_resp.text}")
except Exception as e:
    print(f"Health Check Error: {e}")

url = f"{base_url}/api/auth/guest"
print(f"\nChecking {url}...")

try:
    resp = requests.post(url, json={})
    print(f"Status: {resp.status_code}")
    data = resp.json()
    print("Response keys:", list(data.keys()))
    if "id" in data:
        print(f"SUCCESS! User ID found: {data['id']}")
    else:
        print("FAILURE: 'id' field missing from response.")
        print("Full response:", data)
except json.JSONDecodeError:
    print(f"Error decoding JSON. Response Content: {resp.text}")
except Exception as e:
    print(f"Error: {e}")
