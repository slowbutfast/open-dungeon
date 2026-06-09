import os
import sys
import requests

# Add parent directory to sys.path so config.py can be imported from root folder
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

from config import BASE_URL

def list_models():
    url = f"{BASE_URL}/models"
    
    print(f"Connecting to LM Studio local server at: {url}...")
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()
        
        print("\nConnection Successful!")
        print("Available Models:")
        for model in data.get("data", []):
            print(f"- ID: {model.get('id')}")
            print(f"  Owned by: {model.get('owned_by')}")
            print(f"  Object type: {model.get('object')}")
            print("-" * 40)
            
    except requests.exceptions.ConnectionError:
        print("\nError: Could not connect to LM Studio server.")
        print(f"Please check that:")
        print(f"  1. LM Studio is running on the host machine.")
        print(f"  2. LM Studio's Host Binding is set to '0.0.0.0' instead of '127.0.0.1'.")
        print(f"  3. Your config.py file points to the correct IP address of the host machine.")
    except Exception as e:
        print(f"\nAn error occurred: {e}")

if __name__ == "__main__":
    list_models()
