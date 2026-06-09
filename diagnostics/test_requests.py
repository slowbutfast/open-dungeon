import os
import sys
import requests
import json

# Add parent directory to sys.path so config.py can be imported from root folder
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

from config import BASE_URL

def test_chat_completion():
    url = f"{BASE_URL}/chat/completions"
    
    headers = {
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "model-identifier", # lm-studio automatically maps this to the loaded model
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Write a short poem about coding in Python."}
        ],
        "temperature": 0.7,
        "max_tokens": 150
    }
    
    print(f"Sending chat completion request to {url}...")
    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=30)
        response.raise_for_status()
        
        result = response.json()
        print("\n--- Response Received ---")
        content = result['choices'][0]['message']['content']
        print(content)
        print("-------------------------")
        print(f"Tokens used: Prompt={result.get('usage', {}).get('prompt_tokens')}, Completion={result.get('usage', {}).get('completion_tokens')}")
        
    except requests.exceptions.ConnectionError:
        print("\nError: Could not connect to LM Studio server.")
        print(f"Please check that:")
        print(f"  1. LM Studio is running on the host machine.")
        print(f"  2. LM Studio's Host Binding is set to '0.0.0.0' instead of '127.0.0.1'.")
        print(f"  3. Your config.py file points to the correct IP address of the host machine.")
    except Exception as e:
        print(f"\nAn error occurred: {e}")

if __name__ == "__main__":
    test_chat_completion()
