import os
from dotenv import load_dotenv

# Load the .env file
# By default, it looks for a .env file in the current working directory or parent directories.
load_dotenv()

# Retrieve settings from environment (with defaults)
LM_STUDIO_HOST = os.getenv("LM_STUDIO_HOST", "127.0.0.1")
LM_STUDIO_PORT = os.getenv("LM_STUDIO_PORT", "1234")

BASE_URL = f"http://{LM_STUDIO_HOST}:{LM_STUDIO_PORT}/v1"
