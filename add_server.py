import json
import os
from datetime import datetime

REGISTRY_PATH = r"c:\dc\server-registry\servers.json"

def add_server():
    print("--- SideQuest Server Registry Helper ---")
    
    if not os.path.exists(REGISTRY_PATH):
        print(f"Error: {REGISTRY_PATH} not found!")
        return

    with open(REGISTRY_PATH, 'r') as f:
        data = json.load(f)

    name = input("Server Name: ").strip()
    url = input("Server URL (e.g., https://...): ").strip().rstrip('/')
    desc = input("Description: ").strip()
    owner = input("Owner Name: ").strip()
    pricing = input("Pricing (e.g., Free, $5/mo): ").strip() or "Free"
    
    # Generate a simple ID
    server_id = name.lower().replace(" ", "-") + "-" + str(len(data['servers']) + 1)

    new_server = {
        "id": server_id,
        "name": name,
        "description": desc,
        "url": url,
        "pricing": pricing,
        "status": "online",
        "owner": owner,
        "tags": ["community", "new"],
        "passwordProtected": False
    }

    data['servers'].append(new_server)
    data['lastUpdated'] = datetime.now().strftime("%Y-%m-%d")

    with open(REGISTRY_PATH, 'w') as f:
        json.dump(data, f, indent=4)

    print(f"\nSuccess! Added '{name}' to the registry.")
    print("Next steps: git commit and push the server-registry folder to make it live!")

if __name__ == "__main__":
    add_server()
