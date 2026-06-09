import os
import sys
from openai import OpenAI

# Add parent directory to sys.path so config.py can be imported from root folder
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

from config import BASE_URL

def main():
    client = OpenAI(
        base_url=BASE_URL,
        api_key="lm-studio"
    )
    
    print(f"Sending request to {BASE_URL} using OpenAI SDK client...")
    try:
        completion = client.chat.completions.create(
            model="local-model",
            messages=[
                {"role": "system", "content": "You are a helpful, pattern-oriented assistant."},
                {"role": "user", "content": "Explain the concept of recursion in programming in three simple bullet points."}
            ],
            temperature=0.7,
            max_tokens=200
        )
        
        print("\n--- Response ---")
        print(completion.choices[0].message.content)
        print("----------------")
        
    except Exception as e:
        print(f"\nAn error occurred while interacting with the API: {e}")
        print("Verify your network connection and check config.py configuration.")

if __name__ == "__main__":
    main()
