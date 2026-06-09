# Local LLM Testing & Retro AIDungeon Link

This repository contains tools to connect to, test, and play games using a locally hosted Large Language Model (LLM) through **LM Studio**. 

The workspace is organized into two primary components:
1. **🎮 Game Link (`game/`)**: A retro CRT-styled terminal clone of AIDungeon featuring context compression (auto-summarization) and lore context cards.
2. **🩺 Diagnostics (`diagnostics/`)**: A suite of tools to check connections, verify API requests, and debug environment configurations.

---

## 🛠️ Setup Instructions

### 1. Create and Activate a Python Virtual Environment
Navigate to the root directory and set up your environment:
```bash
# Create the virtual environment
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate
```

### 2. Install Dependencies
Install all required libraries (`openai`, `requests`, `python-dotenv`, and `rich`):
```bash
pip install -r requirements.txt
```

### 3. Connect to your LM Studio Server
Update your host machine's configuration:
1. In LM Studio on the host machine, go to the **Local Server** tab (`<->` icon).
2. Set the **Host** binding from `127.0.0.1` to `0.0.0.0` (accept connections from other devices on the network) and start/restart the server.
3. Open **[.env](file:///Users/gregorylazatin/Documents/Dev/projects/local-llm-testing/.env)** in the root of this project and configure `LM_STUDIO_HOST` with your host PC's network IP (e.g., `172.20.10.2`):
   ```env
   LM_STUDIO_HOST=172.20.10.2
   LM_STUDIO_PORT=1234
   ```

---

## 🎮 Retro AIDungeon Game (`game/`)

A terminal adventure game written in bright green phosphor CRT style using the `rich` library.

### Key Features
* **Auto-Summarization**: Automatically compresses older history turns when active context grows, keeping token count low, response times fast, and preventing VRAM overflow.
* **Context Cards (Lorebook)**: Scans your actions for character/location keywords and injects their descriptions into the prompt context dynamically.
* **AI Lore Scanner**: Run `/scan` during the game to have the LLM automatically extract new character or location cards from recent events and add them to your lorebook.
* **Typing Streams**: Streams LLM responses chunk-by-chunk with a vintage terminal typing effect.

### Launching the Game
To open the game in a new dedicated terminal window on macOS:
```bash
./game/run_game.sh
```

Alternatively, run it directly in your active terminal:
```bash
python3 game/aidungeon_cli.py
```

---

## 🩺 Diagnostics & Testing Suite (`diagnostics/`)

Use these utilities to test connectivity or run lightweight chats with LM Studio:

* **Simple Interactive CLI Chat**:
  ```bash
  python3 diagnostics/chat.py
  ```
  Options: `-s "system prompt"`, `-t <temperature>`.

* **Connection Diagnostic**:
  Checks connection reachability to the host machine's port and displays recommendations if blocked:
  ```bash
  python3 diagnostics/diagnose_network.py
  ```

* **Check Loaded Models**:
  Queries the server to confirm it is listening and prints loaded model identifiers:
  ```bash
  python3 diagnostics/list_models.py
  ```

* **Verify Requests / SDK Clients**:
  Run simple completions or streams to verify python-dotenv and OpenAI SDK setups:
  ```bash
  python3 diagnostics/test_openai_client.py
  python3 diagnostics/test_openai_streaming.py
  python3 diagnostics/test_requests.py
  ```

---

## ⚙️ Host PC Optimization Settings (3060ti + i7-6700k)

For smooth local LLM gameplay on budget host hardware:
1. **GPU Offload (Layers)**: Slide to **Max (100% / All layers)**. This moves your model (e.g., 4-bit 8B models) entirely into the 3060ti's 8GB VRAM, bypassing the slower i7-6700k CPU.
2. **Context Length**: Set context length to **2048** or **3072**. Setting it higher consumes excessive VRAM for KV caching, causing generation speeds to drop.
3. **Flash Attention**: **Enable** in LM Studio settings to halve KV cache size and speed up ingestion.
4. **CPU Threads**: Set CPU threads to **4** (the number of physical cores of your i7-6700k) to prevent thread contention overhead.
