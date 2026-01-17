import requests
import json

base_url = "https://fwsq4lc2rmq66k-8000.proxy.runpod.net"
token = "776dad58-806d-44c4-918f-a992e44daf53"
url = f"{base_url}/api/me"

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

print(f"Checking credits for token {token[:8]}... at {url}")

try:
    resp = requests.get(url, headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Credits: {data.get('credits')}")
        print(f"User ID: {data.get('id')}")
    else:
        print(f"Error: {resp.text}")
except Exception as e:
    print(f"Request failed: {e}")
