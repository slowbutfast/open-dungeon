import os
import sys
import json
import uuid
import re

# Add parent directory to sys.path so config.py can be imported from the root folder
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

from openai import OpenAI
from config import BASE_URL

# Default System Prompt for Zork-style narrator
DEFAULT_SYSTEM_PROMPT = """You are the parser and narrator for a classic text-based adventure game in the style of Zork.
Describe the environment, characters, and results of actions in a sarcastic, conversational, and direct tone, similar to a Game Master in a tabletop RPG.
Keep your responses extremely concise and curt.
For simple physical actions, reply with a single short sentence or phrase (e.g., "Taken.", "Closed.", "You can't go that way.").
Only provide longer room descriptions (1-2 paragraphs) when the player enters a new location or explicitly types "look".
Use the second-person perspective ("You").
Do not write dialogue or actions for the player character ("You").
Never break character.

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


# Helper classes for offline/PTY testing mode when MOCK_LLM=1
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
        
        # 1. Start scene or custom scenario request
        user_msg = messages[-1]["content"] if messages else ""
        if "CHARACTER GENESIS" in user_msg or "starting scene" in user_msg.lower() or "character description" in user_msg.lower():
            content = "You stand on the desert sands of Tatooine."
            return MockCompletionResponse(content)
            
        # 2. Lore card request
        if "JSON array of objects" in user_msg or "Lore Card" in user_msg:
            content = '[{"name": "Korr", "type": "character", "description": "A legendary smuggler.", "trigger_words": ["korr"]}]'
            return MockCompletionResponse(content)
            
        # 3. Summary request
        if "compress the following log" in user_msg.lower():
            content = "A summary of the adventure."
            return MockCompletionResponse(content)
            
        # 4. Standard gameplay turn (stream)
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
            engine_dir = os.path.dirname(os.path.abspath(__file__))
            self.save_dir = os.path.join(engine_dir, "adventures")
        else:
            self.save_dir = save_dir
        os.makedirs(self.save_dir, exist_ok=True)
        
        if os.getenv("MOCK_LLM") == "1":
            self.client = MockOpenAI()
        else:
            self.client = OpenAI(
                base_url=BASE_URL,
                api_key="lm-studio"
            )
        
        # Game State
        self.adventure_id = None
        self.title = "New Adventure"
        self.system_prompt = DEFAULT_SYSTEM_PROMPT
        self.summary = ""
        self.cards = []  # List of dicts representing context cards
        self.history = []  # Active history turns: [{"role": "user"/"assistant", "action_type": "do"/"say"/"story", "text": "..."}]
        self.archived_history = []  # Older, compressed history turns
        self.suggestions = []  # List of 3 suggested actions for the player's next move
        self.location = "West of House"
        self.score = 0
        self.moves = 0
        
        # Settings
        self.model = "local-model"  # Will default to local-model or fallback
        self.temperature = 0.8
        self.max_tokens = 300
        self.summarize_threshold = 8  # Number of active history turns before auto-summarization
        self.auto_summarize = True

    def get_loaded_model(self):
        """Queries LM Studio for the currently loaded LLM model, falling back to any available LLM model."""
        if os.getenv("MOCK_LLM") == "1":
            return "mock-gemma"
            
        try:
            base_url_str = str(self.client.base_url)
            from urllib.parse import urlparse
            import urllib.request
            parsed = urlparse(base_url_str)
            
            # LM Studio has native API at /api/v1/models
            api_url = f"{parsed.scheme}://{parsed.netloc}/api/v1/models"
            req = urllib.request.Request(api_url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=2) as resp:
                data = json.loads(resp.read().decode())
                
                # 1. Look for a model of type 'llm' that is currently loaded
                for m in data.get("models", []):
                    key = m.get("key")
                    if m.get("type") == "llm" and m.get("loaded_instances") and isinstance(key, str):
                        return key
                        
                # 2. Look for any model of type 'llm'
                for m in data.get("models", []):
                    key = m.get("key")
                    if m.get("type") == "llm" and isinstance(key, str):
                        return key
                        
                # 3. Fallback to any model key
                if data.get("models"):
                    key = data.get("models")[0].get("key")
                    if isinstance(key, str):
                        return key
        except Exception:
            pass
            
        # Fallback to OpenAI compatible list if /api/v1/models fails
        try:
            models = self.client.models.list()
            if models.data:
                # Filter out embedding models if possible
                for m in models.data:
                    m_id = m.id
                    if isinstance(m_id, str) and "embed" not in m_id:
                        return m_id
                
                first_id = models.data[0].id
                if isinstance(first_id, str):
                    return first_id
        except Exception:
            pass
            
        return "local-model"

    def new_adventure(self, title="New Adventure", system_prompt=None):
        """Initializes a new adventure state."""
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
        
        # Attempt to dynamically find the loaded model
        resolved = self.get_loaded_model()
        self.model = resolved if isinstance(resolved, str) else "local-model"
            
        self.save()
        return self.adventure_id

    def save(self):
        """Saves current state to a JSON file."""
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
            json.dump(state, f, indent=4, ensure_ascii=False)

    def load(self, adventure_id):
        """Loads an adventure state from JSON."""
        filepath = os.path.join(self.save_dir, f"{adventure_id}.json")
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Adventure {adventure_id} not found.")
            
        with open(filepath, "r", encoding="utf-8") as f:
            state = json.load(f)
            
        self.adventure_id = state.get("adventure_id")
        self.title = state.get("title", "Loaded Adventure")
        self.system_prompt = state.get("system_prompt", DEFAULT_SYSTEM_PROMPT)
        self.summary = state.get("summary", "")
        self.cards = state.get("cards", [])
        self.history = state.get("history", [])
        self.archived_history = state.get("archived_history", [])
        
        # Try to get the currently loaded model first so we don't force a load of a different one
        loaded_model = self.get_loaded_model()
        if loaded_model and isinstance(loaded_model, str) and loaded_model != "local-model":
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

    def list_adventures(self):
        """Lists all saved adventures."""
        adventures = []
        for filename in os.listdir(self.save_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(self.save_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        adventures.append({
                            "id": data.get("adventure_id"),
                            "title": data.get("title", "Untitled Adventure"),
                            "turns": len(data.get("history", [])) + len(data.get("archived_history", [])),
                            "summary": data.get("summary", ""),
                            "location": data.get("location", "West of House"),
                            "score": data.get("score", 0),
                            "moves": data.get("moves", 0)
                        })
                except Exception:
                    pass
        return adventures

    def delete_adventure(self, adventure_id):
        """Deletes a saved adventure JSON file."""
        filepath = os.path.join(self.save_dir, f"{adventure_id}.json")
        if os.path.exists(filepath):
            os.remove(filepath)
            return True
        return False

    def undo(self):
        """Removes the last player action and the last assistant response."""
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
        """Edits an active history turn by its index."""
        if 0 <= index < len(self.history):
            self.history[index]["text"] = new_text
            self.save()
            return True
        return False

    def get_active_cards(self, text_context):
        """Scans the text context to find active lore cards based on trigger words."""
        active_cards = []
        for card in self.cards:
            trigger_words = card.get("trigger_words", [])
            for word in trigger_words:
                # Compile case-insensitive regex matching word boundaries
                pattern = r'\b' + re.escape(word) + r'\b'
                if re.search(pattern, text_context, re.IGNORECASE):
                    active_cards.append(card)
                    break  # Found a match, no need to check other trigger words for this card
        return active_cards

    def build_system_message(self, active_cards=None):
        """Constructs the system prompt, appending the running summary and triggered cards."""
        system_content = self.system_prompt
        
        # Inject current location/score/moves to guide narrator
        system_content += f"\n\n[CURRENT STATUS]\n- Location: {self.location}\n- Score: {self.score}\n- Moves: {self.moves}"
        
        # Inject adventure summary if it exists
        if self.summary:
            system_content += f"\n\n[ADVENTURE SUMMARY]\n{self.summary}"
            
        # Inject active context/lore cards if any are triggered
        if active_cards:
            system_content += "\n\n[WORLD INFO & LORE]"
            for card in active_cards:
                name = card.get("name")
                card_type = card.get("type", "lore").upper()
                desc = card.get("description", "")
                system_content += f"\n- {name} ({card_type}): {desc}"
                
        return {"role": "system", "content": system_content}

    def format_user_input(self, action_type, text):
        """Formats the raw user input into Zork style text."""
        if action_type == "continue":
            return ""
        text = text.strip()
        if action_type in ("do", "say", "story"):
            if text.startswith(">"):
                return text
            return f"> {text}"
        return text

    def generate_response_stream(self, action_type, text):
        """
        Sends the formatted action to the LLM and streams the response.
        Handles auto-summarization and card detection.
        Yields events/chunks for the CLI to print in real-time.
        """
        # 1. Format and add the user's action
        formatted_text = self.format_user_input(action_type, text)
        self.history.append({
            "role": "user",
            "action_type": action_type,
            "text": formatted_text
        })
        
        # 2. Check and execute auto-summarization if active history is too long
        summarized_any = False
        if self.auto_summarize and len(self.history) >= self.summarize_threshold:
            yield {"type": "system", "content": "COMPRESSING CONTEXT AND RUNNING AUTO-SUMMARIZATION..."}
            self.summarize_old_turns()
            summarized_any = True
            
        # 3. Detect active cards in the last 2 turns
        # We check the newly added user action and (if exists) the preceding assistant turn
        recent_text = formatted_text
        if len(self.history) >= 2:
            recent_text = self.history[-2]["text"] + " " + recent_text
            
        active_cards = self.get_active_cards(recent_text)
        if active_cards:
            triggered_names = ", ".join([c["name"] for c in active_cards])
            yield {"type": "system", "content": f"LORE ACTIVATED: {triggered_names}"}

        # Determine if this is a simple physical action to apply dynamic length limits
        request_max_tokens = self.max_tokens
        is_simple_action = False
        if action_type == "do":
            cleaned_cmd = text.strip().lower()
            simple_verbs = (
                "take", "get", "drop", "open", "close", "read", "examine", 
                "inventory", "wear", "look at", "put", "push", "pull", 
                "turn", "unlock", "lock", "use", "drink", "eat"
            )
            if any(cleaned_cmd.startswith(verb) for verb in simple_verbs):
                is_simple_action = True
                # Use a proportional floor so user token budget is respected
                request_max_tokens = max(60, self.max_tokens // 3)

        # 4. Build prompt messages
        messages = []
        system_msg_obj = self.build_system_message(active_cards)
        if is_simple_action:
            system_msg_obj["content"] += "\n(Reply with a single curt sentence of 15 words or less.)"
        messages.append(system_msg_obj)
        
        # Append active history
        for turn in self.history:
            content = turn["text"]
            if not content.strip():
                content = "[Continue]"
            messages.append({"role": turn["role"], "content": content})
            
        # 5. Query LM Studio with streaming enabled
        yield {"type": "status", "content": "Querying model..."}
        
        # Try to resolve loaded model dynamically before query
        loaded_model = self.get_loaded_model()
        if loaded_model and isinstance(loaded_model, str) and loaded_model != "local-model":
            self.model = loaded_model
            self.save()
        
        try:
            try:
                stream = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=self.temperature,
                    max_tokens=request_max_tokens,
                    stream=True
                )
            except Exception as e:
                # If there's an error loading the model, try to refresh model list and fallback to any available model
                error_msg = str(e)
                if "Failed to load model" in error_msg or "400" in error_msg or "model" in error_msg.lower():
                    yield {"type": "system", "content": f"Failed to load '{self.model}'. Attempting fallback..."}
                    fallback_model = self.get_loaded_model()
                    if fallback_model and fallback_model != self.model:
                        yield {"type": "system", "content": f"Falling back to model: '{fallback_model}'"}
                        self.model = fallback_model
                        self.save()
                        stream = self.client.chat.completions.create(
                            model=self.model,
                            messages=messages,
                            temperature=self.temperature,
                            max_tokens=request_max_tokens,
                            stream=True
                        )
                    else:
                        raise e
                else:
                    raise e
            
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
                    
            # Clean up status line from history turn before saving
            cleaned_text = assistant_text.strip()
            if buffer:
                status_match = re.search(r'^\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\]$', buffer.strip())
                if status_match:
                    self.location = status_match.group(1).strip()
                    self.score = int(status_match.group(2).strip())
                    self.moves += 1
                    cleaned_text = assistant_text[:len(assistant_text) - len(buffer)].strip()
                else:
                    # Flush the buffer since it was not a status line
                    yield {"type": "chunk", "content": buffer}
                    self.moves += 1
            else:
                # Fallback: check if status line is in cleaned_text anyway
                status_match = re.search(r'\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\]$', cleaned_text)
                if status_match:
                    self.location = status_match.group(1).strip()
                    self.score = int(status_match.group(2).strip())
                    self.moves += 1
                    cleaned_text = cleaned_text[:status_match.start()].strip()
                else:
                    self.moves += 1
                
            # Save assistant response to history
            self.history.append({
                "role": "assistant",
                "action_type": "narration",
                "text": cleaned_text
            })
            self.save()
            yield {"type": "done", "content": cleaned_text}
            
        except Exception as e:
            # Rollback the user turn on failure to keep history clean
            self.history.pop()
            yield {"type": "error", "content": str(e)}

    def regenerate_last_response(self):
        """Removes the last assistant turn and re-runs generation from previous history."""
        if not self.history:
            yield {"type": "error", "content": "No history to regenerate."}
            return
            
        # Remove last turn if it's assistant
        if self.history[-1]["role"] == "assistant":
            self.history.pop()
            
        if not self.history:
            yield {"type": "error", "content": "No player turn to regenerate a response for."}
            return
            
        # Extract the user's action and text to feed into generate_response_stream
        last_user_turn = self.history.pop()
        raw_text = last_user_turn["text"]
        
        # If it was formatted (e.g. starting with '> '), clean it up back to raw if possible
        if raw_text.startswith("> You try to "):
            raw_text = raw_text[len("> You try to "):]
        elif raw_text.startswith("> You say, \"") and raw_text.endswith("\""):
            raw_text = raw_text[len("> You say, \""):-1]
        elif raw_text.startswith("> "):
            raw_text = raw_text[2:]
            
        action_type = last_user_turn.get("action_type", "story")
        
        # Yield streaming events
        for event in self.generate_response_stream(action_type, raw_text):
            yield event

    def generate_suggestions(self):
        """
        Queries the LLM non-streamed to generate exactly 3 brief suggestion actions 
        for the player based on the current context.
        """
        # 1. Build messages from history
        messages = []
        messages.append({
            "role": "system",
            "content": "You are the Dungeon Master. Based on the story history, generate exactly 3 brief action suggestions of what the player could attempt next. The suggestions must be active, short (less than 10 words each), and starting with a verb (e.g. 'Search the room', 'Talk to the merchant', 'Draw your sword'). Output them ONLY as a numbered list from 1 to 3, with no introductory or concluding text."
        })
        for turn in self.history:
            messages.append({"role": turn["role"], "content": turn["text"]})
            
        # Add a final user request asking for the suggestions to prompt a direct response
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
            # Parse the suggestions robustly
            suggestions = []
            for line in text.splitlines():
                line = line.strip()
                if not line:
                    continue
                # Try to extract the suggestion after a number or bullet prefix
                match = re.match(r'^\s*(?:\d+[\.\)\:-]?|[\-\*\•])\s*(.*)', line)
                if match:
                    cleaned = match.group(1).strip().strip('"\'')
                    if cleaned:
                        suggestions.append(cleaned)
            
            # If no prefixed lines matched, fallback to raw lines
            if not suggestions:
                for line in text.splitlines():
                    cleaned = line.strip().strip('"\'')
                    if cleaned:
                        suggestions.append(cleaned)
            
            # Ensure we have exactly 3 suggestions. If not, pad with different fallbacks.
            fallbacks = ["Proceed forward", "Look around", "Examine your surroundings"]
            while len(suggestions) < 3:
                suggestions.append(fallbacks[len(suggestions)])
            return suggestions[:3]
        except Exception as e:
            # Fallback defaults on failure
            return ["Proceed forward", "Look around", "Examine your surroundings"]

    def summarize_old_turns(self):
        """Takes the first 4 turns of active history, summarizes them, and archives them."""
        if len(self.history) < 4:
            return
            
        turns_to_summarize = self.history[:4]
        # Remove from active history
        self.history = self.history[4:]
        
        # Format the log text for these turns
        events_text = ""
        for turn in turns_to_summarize:
            role_label = "Player" if turn["role"] == "user" else "Dungeon Master"
            events_text += f"{role_label}: {turn['text']}\n"
            
        # Construct summarization prompt
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
            # Clean markdown code blocks if the model wrapped it
            summary_content = re.sub(r"^```[a-zA-Z]*\n", "", summary_content)
            summary_content = re.sub(r"\n```$", "", summary_content).strip()
            
            self.summary = summary_content
            self.archived_history.extend(turns_to_summarize)
            self.save()
            
        except Exception as e:
            # On summary failure, restore turns to active history so story is not lost
            self.history = turns_to_summarize + self.history
            raise RuntimeError(f"Summarization failed: {e}")

    def auto_generate_cards(self):
        """Scans the active history to identify new characters, items, or locations and makes lore cards."""
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
                if card.get("name") and card["name"].lower() not in existing_names:
                    card["id"] = str(uuid.uuid4())[:6]
                    card["enabled"] = True
                    self.cards.append(card)
                    added_cards.append(card)
                    
            if added_cards:
                self.save()
                
            return added_cards
            
        except Exception as e:
            raise RuntimeError(f"Lore extraction failed: {e}")
            
    def add_manual_card(self, name, card_type, description, trigger_words):
        """Allows manually adding a lore card."""
        card_id = str(uuid.uuid4())[:6]
        card = {
            "id": card_id,
            "name": name,
            "type": card_type,
            "description": description,
            "trigger_words": [w.strip() for w in trigger_words if w.strip()],
            "enabled": True
        }
        self.cards.append(card)
        self.save()
        return card

    def delete_card(self, card_id):
        """Deletes a context card by ID."""
        original_len = len(self.cards)
        self.cards = [c for c in self.cards if c.get("id") != card_id]
        if len(self.cards) < original_len:
            self.save()
            return True
        return False
