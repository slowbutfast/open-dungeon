import os
from dotenv import load_dotenv

load_dotenv()

# Backend selection
LLM_BACKEND = os.getenv("LLM_BACKEND", "lmstudio")

# OpenRouter settings
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash")
OPENROUTER_EMBEDDING_MODEL = os.getenv("OPENROUTER_EMBEDDING_MODEL", "nvidia/llama-nemotron-embed-vl-1b-v2:free")
REASONING_EFFORT = os.getenv("REASONING_EFFORT", "low")
MAX_TOKENS_RANGE = os.getenv("MAX_TOKENS_RANGE", "50:300")

# LM Studio settings (legacy)
LM_STUDIO_HOST = os.getenv("LM_STUDIO_HOST", "127.0.0.1")
LM_STUDIO_PORT = os.getenv("LM_STUDIO_PORT", "1234")

BASE_URL = f"http://{LM_STUDIO_HOST}:{LM_STUDIO_PORT}/v1"

if LLM_BACKEND == "openrouter":
    BASE_URL = "https://openrouter.ai/api/v1"