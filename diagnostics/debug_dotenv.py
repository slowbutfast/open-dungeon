import os
import sys

print("=== Python Environment Debug Info ===")
print(f"Python Executable: {sys.executable}")
print(f"Python Version: {sys.version}")
print(f"Current Working Directory: {os.getcwd()}")
print(f"Files in current directory: {os.listdir('.')}")

try:
    import dotenv
    print("✅ 'dotenv' module is successfully installed.")
    print(f"   Loaded from: {dotenv.__file__}")
    
    # Enable verbose loading to see warnings
    script_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(script_dir)
    env_path = os.path.join(parent_dir, ".env")
    print(f"Looking for .env at: {env_path}")
    print(f"Does .env exist? {os.path.exists(env_path)}")
    
    success = dotenv.load_dotenv(dotenv_path=env_path, verbose=True)
    print(f"load_dotenv() result: {success}")
    
    # Check loaded values
    host = os.getenv("LM_STUDIO_HOST")
    port = os.getenv("LM_STUDIO_PORT")
    print(f"LM_STUDIO_HOST value: {repr(host)}")
    print(f"LM_STUDIO_PORT value: {repr(port)}")
    
except ImportError as e:
    print("❌ Failed to import 'dotenv'.")
    print(f"   Error: {e}")
    print("\nThis means python-dotenv is not installed in this specific Python environment.")
    print("Please make sure you have activated your virtual environment or install it globally:")
    print("   pip install python-dotenv")
