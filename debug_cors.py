import requests

url = "https://xh38loz5lg7tum.proxy.runpod.net/api/health"
headers = {
    "Origin": "http://localhost:8080",
    "Access-Control-Request-Method": "GET"
}

try:
    print(f"Sending OPTIONS to {url}...")
    resp = requests.options(url, headers=headers)
    print(f"Status: {resp.status_code}")
    print("Headers:")
    for k, v in resp.headers.items():
        if "access-control" in k.lower():
            print(f"  {k}: {v}")

    print("\nSending GET to {url}...")
    resp = requests.get(url, headers=headers)
    print(f"Status: {resp.status_code}")
    print("Headers:")
    for k, v in resp.headers.items():
        if "access-control" in k.lower():
            print(f"  {k}: {v}")

except Exception as e:
    print(f"Error: {e}")
