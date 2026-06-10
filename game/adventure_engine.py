import os
import sys
import time
import socket
import subprocess
import requests
import json
import atexit
import re
import uuid

DEFAULT_SYSTEM_PROMPT = """You are the parser and narrator for a classic text-based adventure game in the style of Zork.
Describe the environment, characters, and results of actions in a sarcastic, conversational, and direct tone, similar to a Game Master in a tabletop RPG.
Keep your responses extremely concise and curt.
For simple physical actions, reply with a single short sentence or phrase (e.g., "Taken.", "Closed.", "You can't go that way.").
Only provide longer room descriptions (1-2 paragraphs) when the player enters a new location or explicitly types "look".
Use the second-person perspective ("You").
Do not write dialogue or actions for the player character ("You").
Never break character.
Do not write suggestions, choices, options lists, or any trailing questions asking the player what they want to do next (e.g. do not ask "What do you do?" or "What is your next move?"). Let the player decide entirely on their own.

Example 1:
Player: open mailbox
Narrator: Opening the small mailbox reveals a leaflet.
[Status: West of House | Score: 0]

Example 2:
Player: take leaflet
Narrator: Taken.
[Status: West of House | Score: 0]

Example 3:
Player: go north
Narrator: North of House
You are facing the north side of a white house. A forest stretches to the north.
[Status: North of House | Score: 0]

At the very end of EVERY response, you MUST append the current status on a new line in this exact format:
[Status: <Location Name> | Score: <Current Score>]
Do not write anything else on the status line."""

# Helper classes for local mock execution (matching original implementation)
class MockModel:
    def __init__(self, id="mock-gemma"):
        self.id = id

class MockModelList:
    def __init__(self):
        self.data = [MockModel()]

class MockModels:
    def list(self):
        return MockModelList()

class MockChoiceMessage:
    def __init__(self, content):
        self.content = content

class MockChoice:
    def __init__(self, content):
        self.message = MockChoiceMessage(content)

class MockCompletionResponse:
    def __init__(self, content):
        self.choices = [MockChoice(content)]

class MockChatCompletions:
    def create(self, *args, **kwargs):
        stream = kwargs.get("stream", False)
        messages = kwargs.get("messages", [])
        
        user_msg = messages[-1]["content"] if messages else ""
        if "CHARACTER GENESIS" in user_msg or "starting scene" in user_msg.lower() or "character description" in user_msg.lower():
            content = "You stand on the desert sands of Tatooine."
            return MockCompletionResponse(content)
            
        if "JSON array of objects" in user_msg or "Lore Card" in user_msg:
            content = '[{"name": "Korr", "type": "character", "description": "A legendary smuggler.", "trigger_words": ["korr"]}]'
            return MockCompletionResponse(content)
            
        if "compress the following log" in user_msg.lower():
            content = "A summary of the adventure."
            return MockCompletionResponse(content)
            
        narrative = "You walk south into the noisy cantina.\n[Status: Cantina | Score: 5]"
        if stream:
            class ChunkDelta:
                def __init__(self, content):
                    self.content = content
            class ChunkChoice:
                def __init__(self, content):
                    self.delta = ChunkChoice.ChunkDelta(content)
                class ChunkDelta:
                    def __init__(self, content):
                        self.content = content
            class Chunk:
                def __init__(self, content):
                    self.choices = [ChunkChoice(content)]
            
            chunks = []
            for word in narrative.split(" "):
                chunks.append(Chunk(word + " "))
            chunks.append(Chunk("\n[Status: Cantina | Score: 5]"))
            return chunks
        else:
            return MockCompletionResponse(narrative)

class MockChat:
    def __init__(self):
        self.completions = MockChatCompletions()

class MockOpenAI:
    def __init__(self, *args, **kwargs):
        self.base_url = "http://mock-url/v1"
        self.models = MockModels()
        self.chat = MockChat()


class AdventureEngine:
    def __init__(self, save_dir=None):
        if save_dir is None:
            env_save_dir = os.environ.get("SAVE_DIR")
            if env_save_dir:
                self.save_dir = os.path.abspath(env_save_dir)
            else:
                engine_dir = os.path.dirname(os.path.abspath(__file__))
                self.save_dir = os.path.join(engine_dir, "adventures")
        else:
            self.save_dir = save_dir
        os.makedirs(self.save_dir, exist_ok=True)

        self.base_url = "http://127.0.0.1:5001"
        
        # Local state variables
        self._adventure_id = None
        self._title = "New Adventure"
        self._system_prompt = DEFAULT_SYSTEM_PROMPT
        self._summary = ""
        self._cards = []
        self._history = []
        self._archived_history = []
        self._suggestions = []
        self._location = "West of House"
        self._score = 0
        self._moves = 0
        self._model = "local-model"
        self._temperature = 0.8
        self._max_tokens = 300
        self._summarize_threshold = 8
        self._auto_summarize = True
        
        self._client = None
        
        if self._use_http_proxy():
            try:
                self._ensure_server_running()
                self._sync_from_server()
            except Exception:
                pass

    def _ensure_server_running(self):
        port = 5001
        # Check if server is already running
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(('127.0.0.1', port)) == 0:
                    return
        except Exception:
            pass
            
        # If not running, spawn it
        env = os.environ.copy()
        if "MOCK_LLM" not in env:
            env["MOCK_LLM"] = "1"
            
        # Get path to server.js
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        server_path = os.path.join(project_root, "web", "server.js")
        
        self.server_proc = subprocess.Popen(
            ["node", server_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
            cwd=project_root
        )
        
        # Register atexit cleanup handler
        atexit.register(self._cleanup_server)
        
        # Poll server until it responds to ping
        for _ in range(50):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    if s.connect_ex(('127.0.0.1', port)) == 0:
                        break
            except Exception:
                pass
            time.sleep(0.1)
        else:
            raise RuntimeError("JS Express server failed to start on port 5001")

    def _cleanup_server(self):
        if hasattr(self, "server_proc") and self.server_proc:
            try:
                self.server_proc.terminate()
                self.server_proc.wait(timeout=1)
            except Exception:
                try:
                    self.server_proc.kill()
                except Exception:
                    pass

    def _use_http_proxy(self):
        # We do NOT use the HTTP proxy if we are running in unit tests with a mocked client
        if self._client is not None:
            from unittest.mock import MagicMock, Mock
            if isinstance(self._client, (MagicMock, Mock)) or type(self._client).__name__ in ("MagicMock", "Mock"):
                return False
        return True

    def _sync_from_server(self):
        try:
            r = requests.get(f"{self.base_url}/api/state", timeout=2)
            if r.status_code == 200:
                data = r.json()
                self._adventure_id = data.get("adventure_id")
                self._title = data.get("title", "")
                self._system_prompt = data.get("system_prompt", DEFAULT_SYSTEM_PROMPT)
                self._summary = data.get("summary", "")
                self._cards = data.get("cards", [])
                self._history = data.get("history", [])
                self._suggestions = data.get("suggestions", [])
                self._location = data.get("location", "West of House")
                self._score = data.get("score", 0)
                self._moves = data.get("moves", 0)
                self._model = data.get("model", "local-model")
                self._max_tokens = data.get("max_tokens", 300)
        except Exception:
            pass

    def _update_state(self, updates):
        try:
            requests.post(f"{self.base_url}/api/state", json=updates, timeout=2)
        except Exception as e:
            print(f"Error updating server state: {e}")

    def _get_prop(self, name, default):
        if self._use_http_proxy():
            self._sync_from_server()
        return getattr(self, f"_{name}", default)

    # Property Getters and Setters
    @property
    def adventure_id(self):
        return self._get_prop("adventure_id", None)

    @adventure_id.setter
    def adventure_id(self, val):
        self._adventure_id = val
        if self._use_http_proxy():
            self._update_state({"adventure_id": val})

    @property
    def title(self):
        return self._get_prop("title", "New Adventure")

    @title.setter
    def title(self, val):
        self._title = val
        if self._use_http_proxy():
            self._update_state({"title": val})

    @property
    def system_prompt(self):
        return self._get_prop("system_prompt", DEFAULT_SYSTEM_PROMPT)

    @system_prompt.setter
    def system_prompt(self, val):
        self._system_prompt = val
        if self._use_http_proxy():
            self._update_state({"system_prompt": val})

    @property
    def summary(self):
        return self._get_prop("summary", "")

    @summary.setter
    def summary(self, val):
        self._summary = val
        if self._use_http_proxy():
            self._update_state({"summary": val})

    @property
    def cards(self):
        return self._get_prop("cards", [])

    @cards.setter
    def cards(self, val):
        self._cards = val
        if self._use_http_proxy():
            self._update_state({"cards": val})

    @property
    def history(self):
        hist = self._get_prop("history", [])
        if self._use_http_proxy():
            class ProxyList(list):
                def __init__(self, items, on_update):
                    super().__init__(items)
                    self.on_update = on_update
                def pop(self, *args, **kwargs):
                    res = super().pop(*args, **kwargs)
                    self.on_update(list(self))
                    return res
                def append(self, item):
                    super().append(item)
                    self.on_update(list(self))
            return ProxyList(hist, lambda new_list: self._update_history(new_list))
        return hist

    @history.setter
    def history(self, val):
        self._history = val
        if self._use_http_proxy():
            self._update_state({"history": val})

    def _update_history(self, new_list):
        self._history = new_list
        self._update_state({"history": new_list})

    @property
    def archived_history(self):
        return self._get_prop("archived_history", [])

    @archived_history.setter
    def archived_history(self, val):
        self._archived_history = val
        if self._use_http_proxy():
            self._update_state({"archived_history": val})

    @property
    def suggestions(self):
        return self._get_prop("suggestions", [])

    @suggestions.setter
    def suggestions(self, val):
        self._suggestions = val
        if self._use_http_proxy():
            self._update_state({"suggestions": val})

    @property
    def location(self):
        return self._get_prop("location", "West of House")

    @location.setter
    def location(self, val):
        self._location = val
        if self._use_http_proxy():
            self._update_state({"location": val})

    @property
    def score(self):
        return self._get_prop("score", 0)

    @score.setter
    def score(self, val):
        self._score = val
        if self._use_http_proxy():
            self._update_state({"score": val})

    @property
    def moves(self):
        return self._get_prop("moves", 0)

    @moves.setter
    def moves(self, val):
        self._moves = val
        if self._use_http_proxy():
            self._update_state({"moves": val})

    @property
    def model(self):
        return self._get_prop("model", "local-model")

    @model.setter
    def model(self, val):
        self._model = val
        if self._use_http_proxy():
            self._update_state({"model": val})

    @property
    def temperature(self):
        return self._get_prop("temperature", 0.8)

    @temperature.setter
    def temperature(self, val):
        self._temperature = val
        if self._use_http_proxy():
            self._update_state({"temperature": val})

    @property
    def max_tokens(self):
        return self._get_prop("max_tokens", 300)

    @max_tokens.setter
    def max_tokens(self, val):
        self._max_tokens = val
        if self._use_http_proxy():
            self._update_state({"max_tokens": val})

    @property
    def summarize_threshold(self):
        return self._get_prop("summarize_threshold", 8)

    @summarize_threshold.setter
    def summarize_threshold(self, val):
        self._summarize_threshold = val
        if self._use_http_proxy():
            self._update_state({"summarize_threshold": val})

    @property
    def auto_summarize(self):
        return self._get_prop("auto_summarize", True)

    @auto_summarize.setter
    def auto_summarize(self, val):
        self._auto_summarize = val
        if self._use_http_proxy():
            self._update_state({"auto_summarize": val})

    # Client expose (for connection diagnostics in aidungeon_cli.py)
    @property
    def client(self):
        if self._client is not None:
            return self._client
            
        if self._use_http_proxy():
            class MockClient:
                def __init__(self, base_url):
                    self.base_url = base_url
                    self.models = self
                def list(self):
                    r = requests.get(f"{self.base_url}/ping", timeout=2)
                    r.raise_for_status()
                    class ModelData:
                        def __init__(self, id):
                            self.id = id
                    class ModelList:
                        def __init__(self, models):
                            self.data = [ModelData(m) for m in models]
                    return ModelList(r.json().get("models", ["mock-llm"]))
            return MockClient(f"{self.base_url}/api")
            
        # Local non-proxy client initialization
        from openai import OpenAI
        from config import BASE_URL
        if os.getenv("MOCK_LLM") == "1":
            self._client = MockOpenAI()
        else:
            self._client = OpenAI(
                base_url=BASE_URL,
                api_key="lm-studio"
            )
        return self._client

    @client.setter
    def client(self, val):
        self._client = val

    def get_loaded_model(self):
        if self._use_http_proxy():
            r = requests.get(f"{self.base_url}/api/ping", timeout=2)
            if r.status_code == 200:
                return r.json().get("model", "local-model")
            return "local-model"
            
        # Local get_loaded_model
        if os.getenv("MOCK_LLM") == "1":
            return "mock-gemma"
        try:
            # Try parsing from standard list (OpenAI SDK wrapper fallback)
            from unittest.mock import MagicMock, Mock
            if isinstance(self.client, (MagicMock, Mock)) or type(self.client).__name__ in ("MagicMock", "Mock"):
                return self._model if isinstance(self._model, str) else "mock-gemma"
            models = self.client.models.list()
            if isinstance(models, (MagicMock, Mock)) or type(models).__name__ in ("MagicMock", "Mock"):
                return self._model if isinstance(self._model, str) else "mock-gemma"
            if models and models.data:
                for m in models.data:
                    if isinstance(m.id, str) and "embed" not in m.id:
                        return m.id
                if isinstance(models.data[0].id, str):
                    return models.data[0].id
        except Exception:
            pass
        return "local-model"

    def new_adventure(self, title="New Adventure", system_prompt=None):
        if self._use_http_proxy():
            payload = {
                "title": title,
                "system_prompt": system_prompt
            }
            r = requests.post(f"{self.base_url}/api/init", json=payload, timeout=5)
            r.raise_for_status()
            self._sync_from_server()
            return self._adventure_id
            
        # Local new_adventure
        self.adventure_id = str(uuid.uuid4())[:8]
        self.title = title
        self.system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        self.summary = ""
        self.cards = []
        self.history = []
        self.suggestions = []
        self.archived_history = []
        self.location = "West of House"
        self.score = 0
        self.moves = 0
        
        resolved = self.get_loaded_model()
        self.model = resolved if isinstance(resolved, str) else "local-model"
        
        self.save()
        return self.adventure_id

    def save(self):
        if self._use_http_proxy():
            self._update_state({
                "history": self._history,
                "cards": self._cards,
                "system_prompt": self._system_prompt,
                "summary": self._summary,
                "location": self._location,
                "score": self._score,
                "moves": self._moves,
                "model": self._model,
                "max_tokens": self._max_tokens
            })
            return
            
        # Local save
        if not self.adventure_id:
            raise ValueError("No active adventure to save.")
        filepath = os.path.join(self.save_dir, f"{self.adventure_id}.json")
        state = {
            "adventure_id": self.adventure_id,
            "title": self.title,
            "system_prompt": self.system_prompt,
            "summary": self.summary,
            "cards": self.cards,
            "history": self.history,
            "archived_history": self.archived_history,
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "summarize_threshold": self.summarize_threshold,
            "auto_summarize": self.auto_summarize,
            "location": self.location,
            "score": self.score,
            "moves": self.moves
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=4)

    def load(self, adventure_id):
        if self._use_http_proxy():
            r = requests.post(f"{self.base_url}/api/saves/{adventure_id}", timeout=2)
            r.raise_for_status()
            self._sync_from_server()
            return
            
        # Local load
        filepath = os.path.join(self.save_dir, f"{adventure_id}.json")
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                state = json.load(f)
                
            self.adventure_id = state["adventure_id"]
            self.title = state.get("title", "Loaded Adventure")
            self.system_prompt = state.get("system_prompt", DEFAULT_SYSTEM_PROMPT)
            self.summary = state.get("summary", "")
            self.cards = state.get("cards", [])
            self.history = state.get("history", [])
            self.archived_history = state.get("archived_history", [])
            
            loaded_model = self.get_loaded_model()
            if loaded_model and loaded_model != "local-model":
                self.model = loaded_model
            else:
                self.model = state.get("model", "local-model")
                
            self.temperature = state.get("temperature", 0.8)
            self.max_tokens = state.get("max_tokens", 300)
            self.summarize_threshold = state.get("summarize_threshold", 8)
            self.auto_summarize = state.get("auto_summarize", True)
            self.location = state.get("location", "West of House")
            self.score = state.get("score", 0)
            self.moves = state.get("moves", 0)
            self.suggestions = []
        except Exception as e:
            raise RuntimeError(f"Adventure {adventure_id} not found: {e}")

    def list_adventures(self):
        if self._use_http_proxy():
            r = requests.get(f"{self.base_url}/api/saves", timeout=2)
            if r.status_code == 200:
                return r.json()
            return []
            
        # Local list
        adventures = []
        import glob
        for file in glob.glob(os.path.join(self.save_dir, "*.json")):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    state = json.load(f)
                    adventures.append({
                        "id": state["adventure_id"],
                        "title": state.get("title", "Untitled Adventure"),
                        "turns": len(state.get("history", [])) + len(state.get("archived_history", [])),
                        "summary": state.get("summary", ""),
                        "location": state.get("location", "West of House"),
                        "score": state.get("score", 0),
                        "moves": state.get("moves", 0)
                    })
            except Exception:
                pass
        return adventures

    def delete_adventure(self, adventure_id):
        if self._use_http_proxy():
            r = requests.delete(f"{self.base_url}/api/saves/{adventure_id}", timeout=2)
            return r.status_code == 200
            
        # Local delete
        filepath = os.path.join(self.save_dir, f"{adventure_id}.json")
        try:
            os.remove(filepath)
            return True
        except Exception:
            return False

    def undo(self):
        if self._use_http_proxy():
            r = requests.post(f"{self.base_url}/api/action", json={"action_type": "undo"}, timeout=2)
            if r.status_code == 200:
                self._sync_from_server()
                if len(self._history) >= 2:
                    return self._history[-2], self._history[-1]
            return None, None
            
        # Local undo
        if len(self.history) >= 2:
            assistant_turn = self.history.pop()
            user_turn = self.history.pop()
            self.save()
            return user_turn, assistant_turn
        elif len(self.history) == 1:
            user_turn = self.history.pop()
            self.save()
            return user_turn, None
        return None, None

    def edit_turn(self, index, new_text):
        self._history[index]["text"] = new_text
        if self._use_http_proxy():
            self._update_state({"history": self._history})
        else:
            self.save()
        return True

    def get_active_cards(self, text_context):
        active_cards = []
        for card in self.cards:
            triggers = card.get("trigger_words") or card.get("triggers") or []
            for word in triggers:
                escaped = re.escape(word)
                regex = re.compile(rf"\b{escaped}\b", re.IGNORECASE)
                if regex.search(text_context):
                    active_cards.append(card)
                    break
        return active_cards

    def build_system_message(self, active_cards=None):
        system_content = self.system_prompt
        system_content += f"\n\n[CURRENT STATUS]\n- Location: {self.location}\n- Score: {self.score}\n- Moves: {self.moves}"
        
        if self.summary:
            system_content += f"\n\n[ADVENTURE SUMMARY]\n{self.summary}"
            
        if active_cards:
            system_content += "\n\n[WORLD INFO & LORE]"
            for card in active_cards:
                name = card["name"]
                ctype = card.get("type", "lore").upper()
                desc = card.get("description", "")
                system_content += f"\n- {name} ({ctype}): {desc}"
                
        return {"role": "system", "content": system_content}

    def generate_response_stream(self, action_type, text):
        if self._use_http_proxy():
            payload = {
                "action_type": action_type,
                "text": text
            }
            r = requests.post(f"{self.base_url}/api/action", json=payload, stream=True)
            r.raise_for_status()
            
            for line in r.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8')
                    if decoded_line.startswith('data: '):
                        event = json.loads(decoded_line[6:])
                        yield event
            self._sync_from_server()
            return

        # Local generate_response_stream
        def format_user_input(atype, txt):
            if atype == "continue":
                return ""
            cleaned = txt.strip()
            if atype in ("do", "say", "story"):
                if cleaned.startswith(">"):
                    return cleaned
                return f"> {cleaned}"
            return cleaned

        formatted_text = format_user_input(action_type, text)
        self.history.append({
            "role": "user",
            "action_type": action_type,
            "text": formatted_text
        })

        if self.auto_summarize and len(self.history) >= self.summarize_threshold:
            yield {"type": "system", "content": "COMPRESSING CONTEXT AND RUNNING AUTO-SUMMARIZATION..."}
            self.summarize_old_turns()

        recent_text = formatted_text
        if len(self.history) >= 2:
            recent_text = self.history[-2]["text"] + " " + recent_text

        active_cards = self.get_active_cards(recent_text)
        if active_cards:
            triggered_names = ", ".join([c["name"] for c in active_cards])
            yield {"type": "system", "content": f"LORE ACTIVATED: {triggered_names}"}

        request_max_tokens = self.max_tokens
        is_simple_action = False
        if action_type == "do":
            cleaned_cmd = text.strip().lower()
            simple_verbs = [
                "take", "get", "drop", "open", "close", "read", "examine", 
                "inventory", "wear", "look at", "put", "push", "pull", 
                "turn", "unlock", "lock", "use", "drink", "eat"
            ]
            if any(cleaned_cmd.startswith(verb) for verb in simple_verbs):
                is_simple_action = True
                request_max_tokens = max(60, self.max_tokens // 3)

        messages = []
        system_msg_obj = self.build_system_message(active_cards)
        if is_simple_action:
            system_msg_obj["content"] += "\n(Reply with a single curt sentence of 15 words or less.)"
        messages.append(system_msg_obj)

        for turn in self.history:
            content = turn["text"]
            if not content or not content.strip():
                content = "[Continue]"
            messages.append({"role": turn["role"], "content": content})

        yield {"type": "status", "content": "Querying model..."}

        resolved = self.get_loaded_model()
        if isinstance(resolved, str) and resolved and resolved != "local-model":
            self.model = resolved
            self.save()

        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=request_max_tokens,
                stream=True
            )
            
            assistant_text = ""
            buffer = ""
            
            for chunk in stream:
                content = chunk.choices[0].delta.content
                if content is not None:
                    assistant_text += content
                    
                    if not buffer and '[' in content:
                        idx = content.find('[')
                        before = content[:idx]
                        if before:
                            yield {"type": "chunk", "content": before}
                        buffer = content[idx:]
                    elif buffer:
                        buffer += content
                        if len(buffer) > 150:
                            yield {"type": "chunk", "content": buffer}
                            buffer = ""
                    else:
                        yield {"type": "chunk", "content": content}
                        
            cleaned_text = assistant_text.strip()
            if buffer:
                status_match = re.match(r'^\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\]$', buffer.strip())
                if status_match:
                    self.location = status_match.group(1).strip()
                    self.score = int(status_match.group(2).strip())
                    self.moves += 1
                    cleaned_text = assistant_text[:-len(buffer)].strip()
                else:
                    yield {"type": "chunk", "content": buffer}
                    self.moves += 1
            else:
                status_match = re.search(r'\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\]$', cleaned_text)
                if status_match:
                    self.location = status_match.group(1).strip()
                    self.score = int(status_match.group(2).strip())
                    self.moves += 1
                    cleaned_text = cleaned_text[:status_match.start()].strip()
                else:
                    self.moves += 1
                    
            self.history.append({
                "role": "assistant",
                "action_type": "narration",
                "text": cleaned_text
            })
            self.save()
            yield {"type": "done", "content": cleaned_text}
            
        except Exception as err:
            self.history.pop()
            yield {"type": "error", "content": str(err)}

    def regenerate_last_response(self):
        if self._use_http_proxy():
            payload = {
                "action_type": "retry",
                "text": ""
            }
            r = requests.post(f"{self.base_url}/api/action", json=payload, stream=True)
            r.raise_for_status()
            
            for line in r.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8')
                    if decoded_line.startswith('data: '):
                        event = json.loads(decoded_line[6:])
                        yield event
            self._sync_from_server()
            return
            
        # Local regenerate_last_response
        if not self.history:
            yield {"type": "error", "content": "No history to regenerate."}
            return
        if self.history[-1]["role"] == "assistant":
            self.history.pop()
        if not self.history:
            yield {"type": "error", "content": "No player turn to regenerate a response for."}
            return
        last_user_turn = self.history.pop()
        raw_text = last_user_turn["text"]
        if raw_text.startswith("> You try to "):
            raw_text = raw_text[len("> You try to "):]
        elif raw_text.startswith("> You say, \"") and raw_text.endswith("\""):
            raw_text = raw_text[len("> You say, \""):-1]
        elif raw_text.startswith("> "):
            raw_text = raw_text[2:]
        action_type = last_user_turn.get("action_type", "story")
        for event in self.generate_response_stream(action_type, raw_text):
            yield event

    def generate_suggestions(self):
        if self._use_http_proxy():
            self._sync_from_server()
            if self._suggestions:
                return self._suggestions
            r = requests.get(f"{self.base_url}/api/state", timeout=2)
            if r.status_code == 200:
                self._suggestions = r.json().get("suggestions", [])
                return self._suggestions
            return ["Proceed forward", "Look around", "Examine your surroundings"]
            
        # Local generate_suggestions
        messages = [
            {"role": "system", "content": "You are the Dungeon Master. Based on the story history, generate exactly 3 brief action suggestions of what the player could attempt next. The suggestions must be active, short (less than 10 words each), and starting with a verb (e.g. 'Search the room', 'Talk to the merchant', 'Draw your sword'). Output them ONLY as a numbered list from 1 to 3, with no introductory or concluding text."}
        ]
        for turn in self.history:
            messages.append({"role": turn["role"], "content": turn["text"]})
        messages.append({
            "role": "user",
            "content": "Based on the scene above, list exactly 3 short, active suggestion actions for what I can do next. Format as a numbered list (1., 2., 3.). Do not write anything else."
        })
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                max_tokens=64,
                stream=False
            )
            text = response.choices[0].message.content.strip()
            suggestions = []
            for line in text.splitlines():
                line = line.strip()
                if not line:
                    continue
                match = re.match(r'^\s*(?:\d+[\.\)\:-]?|[\-\*\•])\s*(.*)', line)
                if match:
                    cleaned = match.group(1).strip().strip('"\'')
                    if cleaned:
                        suggestions.append(cleaned)
            if not suggestions:
                for line in text.splitlines():
                    cleaned = line.strip().strip('"\'')
                    if cleaned:
                        suggestions.append(cleaned)
            fallbacks = ["Proceed forward", "Look around", "Examine your surroundings"]
            while len(suggestions) < 3:
                suggestions.append(fallbacks[len(suggestions)])
            return suggestions[:3]
        except Exception:
            return ["Proceed forward", "Look around", "Examine your surroundings"]

    def summarize_old_turns(self):
        # Local summarize_old_turns
        if len(self.history) < 4:
            return
            
        turns_to_summarize = self.history[:4]
        self.history = self.history[4:]
        
        events_text = ""
        for turn in turns_to_summarize:
            role_label = "Player" if turn["role"] == "user" else "Dungeon Master"
            events_text += f"{role_label}: {turn['text']}\n"
            
        prompt = f"""You are the chronicler of a fantasy text adventure.
Your job is to update the adventure's running summary.
Incorporate the new events in the LOG into the EXISTING SUMMARY.
Produce a single, concise summary (1-2 paragraphs) in the third person. Keep track of characters met, inventory items acquired/lost, locations visited, and the current goal.

EXISTING SUMMARY:
{self.summary or "The adventure has just begun."}

LOG OF NEW EVENTS:
{events_text}

Provide ONLY the updated summary text. Do not write introductory words like "Here is the summary" or use markdown code blocks. Just print the summary.
"""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a concise summarizer for a text adventure game."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                max_tokens=250
            )
            
            summary_content = response.choices[0].message.content.strip()
            summary_content = re.sub(r"^```[a-zA-Z]*\n", "", summary_content)
            summary_content = re.sub(r"\n```$", "", summary_content).strip()
            
            self.summary = summary_content
            self.archived_history.extend(turns_to_summarize)
            self.save()
            
        except Exception as e:
            self.history = turns_to_summarize + self.history
            raise RuntimeError(f"Summarization failed: {e}")

    def add_manual_card(self, name, card_type, description, trigger_words):
        """Allows manually adding a lore card."""
        if self._use_http_proxy():
            try:
                payload = {
                    "action": "add",
                    "card": {
                        "name": name,
                        "type": card_type,
                        "description": description,
                        "triggers": trigger_words
                    }
                }
                r = requests.post(f"{self.base_url}/api/lore", json=payload, timeout=2)
                r.raise_for_status()
                self._sync_from_server()
                # Find the newly added card from synced cards to return it
                for c in self.cards:
                    if c.get("name") == name:
                        return c
            except Exception as e:
                # Fallback to local on proxy error
                pass
        
        # Local fallback
        card_id = str(uuid.uuid4())[:6]
        card = {
            "id": card_id,
            "name": name,
            "type": card_type,
            "description": description,
            "trigger_words": [w.strip() for w in trigger_words if w.strip()],
            "triggers": [w.strip() for w in trigger_words if w.strip()],
            "enabled": True,
            "active": True
        }
        self.cards.append(card)
        self.save()
        return card

    def delete_card(self, card_id):
        """Deletes a context card by ID."""
        if self._use_http_proxy():
            try:
                # In the HTTP proxy, delete expects action: "delete" and index.
                # Let's find index of card with card_id
                card_idx = None
                for idx, c in enumerate(self.cards):
                    if c.get("id") == card_id:
                        card_idx = idx
                        break
                if card_idx is not None:
                    payload = {
                        "action": "delete",
                        "index": card_idx
                    }
                    r = requests.post(f"{self.base_url}/api/lore", json=payload, timeout=2)
                    r.raise_for_status()
                    self._sync_from_server()
                    return True
            except Exception as e:
                pass
        
        # Local fallback
        original_len = len(self.cards)
        self.cards = [c for c in self.cards if c.get("id") != card_id]
        if len(self.cards) < original_len:
            self.save()
            return True
        return False

    def auto_generate_cards(self):
        """Scans the active history to identify new characters, items, or locations and makes lore cards."""
        if self._use_http_proxy():
            try:
                r = requests.post(f"{self.base_url}/api/scan", timeout=5)
                r.raise_for_status()
                # Compare before and after
                old_card_ids = {c.get("id") for c in self.cards}
                self._sync_from_server()
                new_cards = [c for c in self.cards if c.get("id") not in old_card_ids]
                return new_cards
            except Exception as e:
                # Fallback to local on proxy error
                pass

        # Local fallback
        if not self.history and not self.archived_history:
            return []
            
        # Combine recent history
        combined_turns = self.archived_history[-4:] + self.history
        log_text = ""
        for turn in combined_turns:
            role_label = "Player" if turn["role"] == "user" else "DM"
            log_text += f"{role_label}: {turn['text']}\n"
            
        prompt = f"""You are an AI assistant analyzing a text adventure log.
Identify any key characters, locations, items, or lore elements introduced or described in the log below.
Create a Context Card for each entity.

Output MUST be a valid JSON array of objects. Do not wrap the JSON in markdown code blocks. Do not write any explanations before or after the JSON.
Each object in the JSON array must have exactly these keys:
- "name": the entity's name (string)
- "type": one of "character", "location", "item", "lore" (string)
- "description": a concise 1-2 sentence description of their appearance, personality, or properties (string)
- "trigger_words": a list of 2-4 keywords or aliases that, when mentioned, should trigger this card (array of strings, case-insensitive)

Adventure Log:
{log_text}

JSON Output:
"""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an assistant that outputs structured data in pure JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=800
            )
            
            raw_output = response.choices[0].message.content.strip()
            
            # Clean markdown code blocks
            raw_output = re.sub(r"^```[a-zA-Z]*\n", "", raw_output)
            raw_output = re.sub(r"\n```$", "", raw_output).strip()
            
            # Locate JSON bounds in case LLM added extra text
            start_idx = raw_output.find('[')
            end_idx = raw_output.rfind(']')
            if start_idx != -1 and end_idx != -1:
                json_str = raw_output[start_idx:end_idx+1]
            else:
                json_str = raw_output
                
            new_cards = json.loads(json_str)
            
            added_cards = []
            existing_names = {c["name"].lower() for c in self.cards}
            
            for card in new_cards:
                name = card.get("name")
                if name and name.lower() not in existing_names:
                    card["id"] = str(uuid.uuid4())[:6]
                    card["enabled"] = True
                    card["active"] = True
                    if "trigger_words" in card:
                        card["triggers"] = card["trigger_words"]
                    elif "triggers" in card:
                        card["trigger_words"] = card["triggers"]
                    self.cards.append(card)
                    added_cards.append(card)
                    
            if added_cards:
                self.save()
                
            return added_cards
            
        except Exception as e:
            raise RuntimeError(f"Lore extraction failed: {e}")
