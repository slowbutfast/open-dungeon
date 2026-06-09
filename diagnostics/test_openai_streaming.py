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
    
    print(f"Streaming request to {BASE_URL} using OpenAI SDK client...")
    try:
        stream = client.chat.completions.create(
            model="local-model",
            messages=[
                {"role": "system", "content": "You are a creative writer."},
                {"role": "user", "content": "Write a short paragraph describing a futuristic city in the style of cyberpunk science fiction."}
            ],
            temperature=0.8,
            max_tokens=300,
            stream=True
        )
        
        print("\n--- Response Stream ---")
        for chunk in stream:
            content = chunk.choices[0].delta.content
            if content is not None:
                sys.stdout.write(content)
                sys.stdout.flush()
        print("\n-----------------------")
        
    except Exception as e:
        print(f"\nAn error occurred: {e}")
        print("Verify your network connection and check config.py configuration.")

if __name__ == "__main__":
    main()
