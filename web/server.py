import os
import sys
import json
from flask import Flask, request, jsonify, render_template, Response, send_from_directory
from flask_cors import CORS

# Add parent directory and game directory to sys.path so adventure_engine and config can be imported
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

game_dir = os.path.join(parent_dir, "game")
if game_dir not in sys.path:
    sys.path.append(game_dir)

from adventure_engine import AdventureEngine, DEFAULT_SYSTEM_PROMPT
from menu_manager import STORY_PRESETS

# Set mock environment variable if running locally for tests
if os.getenv("MOCK_LLM") is None:
    # Default mock on for testing or offline dev
    os.environ["MOCK_LLM"] = "1"

# Initialize Flask app
current_dir = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    template_folder=os.path.join(current_dir, "templates"),
    static_folder=os.path.join(current_dir, "static")
)
CORS(app)

# Global adventure engine instance
engine = AdventureEngine()

@app.route("/")
def index():
    """Renders the main desktop UI page."""
    return render_template("index.html")

@app.route("/api/presets", methods=["GET"])
def get_presets():
    """Returns available story presets."""
    return jsonify(STORY_PRESETS)

@app.route("/api/ping", methods=["GET"])
def ping_llm():
    """Probes the LLM host and returns connection status and host info."""
    from config import LM_STUDIO_HOST, LM_STUDIO_PORT, BASE_URL
    host = LM_STUDIO_HOST
    port = LM_STUDIO_PORT
    
    # If mocking, report as offline (mock) so the UI shows correctly
    if os.getenv("MOCK_LLM") == "1":
        return jsonify({
            "status": "mock",
            "host": host,
            "port": port,
            "model": "mock-llm",
            "models": ["mock-llm"],
            "base_url": BASE_URL
        })
    
    try:
        import urllib.request
        # Try LM Studio native API first to find what is loaded
        req = urllib.request.Request(
            f"http://{host}:{port}/api/v1/models",
            headers={"Accept": "application/json"},
            method="GET"
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            body = json.loads(resp.read().decode())
            models_data = body.get("models", [])
            model_ids = [m["key"] for m in models_data]
            
            # Find the loaded model
            loaded_model = None
            for m in models_data:
                if m.get("type") == "llm" and m.get("loaded_instances"):
                    loaded_model = m.get("key")
                    break
            
            # Fallback to first LLM model
            if not loaded_model:
                for m in models_data:
                    if m.get("type") == "llm":
                        loaded_model = m.get("key")
                        break
            
            # Fallback to first model
            if not loaded_model and model_ids:
                loaded_model = model_ids[0]
                
        return jsonify({
            "status": "online",
            "host": host,
            "port": port,
            "model": loaded_model or "unknown",
            "models": model_ids,
            "base_url": BASE_URL
        })
    except Exception as e:
        # Fallback to standard OpenAI compatible /v1/models
        try:
            import urllib.request
            req = urllib.request.Request(
                f"http://{host}:{port}/v1/models",
                headers={"Accept": "application/json"},
                method="GET"
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                body = json.loads(resp.read().decode())
                models_data = body.get("data", [])
                model_ids = [m["id"] for m in models_data]
                loaded_model = model_ids[0] if model_ids else "unknown"
            return jsonify({
                "status": "online",
                "host": host,
                "port": port,
                "model": loaded_model,
                "models": model_ids,
                "base_url": BASE_URL
            })
        except Exception as err:
            return jsonify({
                "status": "offline",
                "host": host,
                "port": port,
                "model": None,
                "models": [],
                "error": str(err)
            })

@app.route("/api/state", methods=["GET"])
def get_state():
    """Returns the current state of the game engine."""
    global engine
    # Generate suggestions if empty and game is active
    if engine.adventure_id and not engine.suggestions:
        try:
            engine.generate_suggestions()
        except Exception:
            pass
            
    return jsonify({
        "adventure_id": engine.adventure_id,
        "title": engine.title,
        "location": engine.location,
        "score": engine.score,
        "moves": engine.moves,
        "history": engine.history,
        "cards": engine.cards,
        "summary": engine.summary,
        "system_prompt": engine.system_prompt,
        "suggestions": engine.suggestions,
        "max_tokens": engine.max_tokens,
        "model": engine.model
    })

@app.route("/api/init", methods=["POST"])
def init_game():
    """Initializes a new adventure connection."""
    global engine
    data = request.json or {}
    
    preset_idx = data.get("preset_idx") # 0-indexed LOTR/Cyberpunk/StarWars, or null for custom
    custom_title = data.get("title")
    custom_summary = data.get("summary")
    custom_system_prompt = data.get("system_prompt")
    char_data = data.get("character", {})
    
    # Reset engine
    engine = AdventureEngine()
    
    # 1. Apply Preset or Custom Settings
    title = "Custom Adventure"
    summary = "You stand at the beginning of a mysterious custom quest."
    system_prompt = DEFAULT_SYSTEM_PROMPT
    
    if preset_idx is not None and 0 <= preset_idx < len(STORY_PRESETS):
        preset = STORY_PRESETS[preset_idx]
        title = preset["title"]
        summary = preset["summary"]
        system_prompt = preset["system_prompt"]
        
    # Overwrite with custom values if provided
    if custom_title:
        title = custom_title
    if custom_summary:
        summary = custom_summary
    if custom_system_prompt:
        system_prompt = custom_system_prompt
        
    engine.new_adventure(title=title, system_prompt=system_prompt)
    engine.summary = summary
    
    # 2. Setup Character
    char_name = char_data.get("name", "Eldrin")
    char_type = char_data.get("type", "Mage")
    char_desc = char_data.get("desc", "A mysterious wizard.")
    char_triggers = char_data.get("triggers", [char_name.lower()])
    if isinstance(char_triggers, str):
        char_triggers = [t.strip() for t in char_triggers.split(",") if t.strip()]
        
    # Append character details to starting history as a system message
    desc_node = f"You are {char_name}, a {char_type}. {char_desc}"
    engine.history.append({
        "role": "user",
        "action_type": "story",
        "text": f"Character description: {desc_node}"
    })
    
    # Trigger local mock starting scene generation
    # For a real game, it triggers generate_starting_scene, but for web we do it inline here
    try:
        # Create a starting scene
        prompt = f"Write the opening scene for a text adventure game. Title: {title}. Character: {char_name} ({char_type}). Starting scenario: {summary}"
        # We query the completions directly
        response = engine.client.chat.completions.create(
            model=engine.model,
            messages=[
                {"role": "system", "content": engine.system_prompt},
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            max_tokens=engine.max_tokens
        )
        opening_scene = response.choices[0].message.content.strip()
        engine.history.append({
            "role": "assistant",
            "text": opening_scene
        })
    except Exception as e:
        engine.history.append({
            "role": "assistant",
            "text": f"You wake up in the world of {title}. {summary}\n[Status: Starting Location | Score: 0]"
        })
        
    # Save the initial state
    engine.save()
    
    # Extract locations & scores
    engine.location = "Starting Location"
    engine.score = 0
    engine.moves = 1
    
    return jsonify({"status": "success", "adventure_id": engine.adventure_id})

@app.route("/api/action", methods=["POST"])
def game_action():
    """Handles turn actions (do/say/continue/retry/undo). Returns event streams."""
    global engine
    data = request.json or {}
    action_type = data.get("action_type", "do")
    text = data.get("text", "")
    
    if action_type == "undo":
        try:
            engine.undo()
            return jsonify({"status": "success", "message": "Last action undone successfully."})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 400
            
    # For stream requests (standard actions or retry)
    def generate():
        try:
            if action_type == "retry":
                stream = engine.regenerate_last_response()
            else:
                stream = engine.generate_response_stream(action_type, text)
                
            for event in stream:
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
            
    return Response(generate(), mimetype="text/event-stream")

@app.route("/api/system", methods=["POST"])
def update_system_prompt():
    """Updates the active narrator system prompt."""
    global engine
    data = request.json or {}
    new_prompt = data.get("system_prompt")
    if new_prompt:
        engine.system_prompt = new_prompt
        engine.save()
        return jsonify({"status": "success", "message": "System prompt updated."})
    return jsonify({"status": "error", "message": "Prompt cannot be blank."}), 400

@app.route("/api/summary", methods=["POST"])
def update_summary():
    """Updates the adventure memory summary."""
    global engine
    data = request.json or {}
    new_summary = data.get("summary")
    if new_summary:
        engine.summary = new_summary
        engine.save()
        return jsonify({"status": "success", "message": "Memory summary updated."})
    return jsonify({"status": "error", "message": "Summary cannot be blank."}), 400

@app.route("/api/saves", methods=["GET"])
def get_saves():
    """Lists saved adventures."""
    global engine
    return jsonify(engine.list_adventures())

@app.route("/api/saves/<save_id>", methods=["POST"])
def load_save(save_id):
    """Loads a specific saved game slot."""
    global engine
    try:
        engine.load(save_id)
        return jsonify({"status": "success", "message": f"Loaded adventure: {engine.title}"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route("/api/saves/<save_id>", methods=["DELETE"])
def delete_save(save_id):
    """Deletes a specific saved game slot."""
    global engine
    try:
        engine.delete_adventure(save_id)
        return jsonify({"status": "success", "message": f"Deleted adventure slot {save_id}."})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route("/api/lore", methods=["POST"])
def modify_lore():
    """Adds, updates, or deletes context lore cards."""
    global engine
    data = request.json or {}
    action = data.get("action") # "add", "update", "delete", "toggle"
    card_idx = data.get("index")
    card_data = data.get("card", {})
    
    try:
        if action == "add":
            name = card_data.get("name", "").strip()
            desc = card_data.get("description", "").strip()
            triggers = card_data.get("triggers", [])
            if isinstance(triggers, str):
                triggers = [t.strip() for t in triggers.split(",") if t.strip()]
            ctype = card_data.get("type", "character")
            
            card = {
                "name": name,
                "type": ctype,
                "description": desc,
                "triggers": triggers,
                "active": True
            }
            engine.cards.append(card)
            
        elif action == "update" and card_idx is not None and 0 <= card_idx < len(engine.cards):
            card = engine.cards[card_idx]
            card["name"] = card_data.get("name", card["name"]).strip()
            card["description"] = card_data.get("description", card.get("description", "")).strip()
            ctype = card_data.get("type", card.get("type", "character"))
            card["type"] = ctype
            triggers = card_data.get("triggers", card.get("triggers", []))
            if isinstance(triggers, str):
                triggers = [t.strip() for t in triggers.split(",") if t.strip()]
            card["triggers"] = triggers
            
        elif action == "delete" and card_idx is not None and 0 <= card_idx < len(engine.cards):
            engine.cards.pop(card_idx)
            
        elif action == "toggle" and card_idx is not None and 0 <= card_idx < len(engine.cards):
            engine.cards[card_idx]["active"] = not engine.cards[card_idx].get("active", True)
            
        engine.save()
        return jsonify({"status": "success", "cards": engine.cards})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route("/api/scan", methods=["POST"])
def scan_lore():
    """Runs a manual lore card extraction scan on history."""
    global engine
    try:
        log_text = ""
        for turn in engine.history[-6:]:
            log_text += f"{turn.get('role', 'user')}: {turn.get('text', '')}\n"
            
        new_cards = engine.scan_lore_entities(log_text)
        if new_cards:
            return jsonify({"status": "success", "message": f"Scan complete. Found cards: {', '.join(new_cards)}", "cards": engine.cards})
        return jsonify({"status": "success", "message": "Scan complete. No new cards identified.", "cards": engine.cards})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route("/api/settings", methods=["POST"])
def update_settings():
    """Updates engine runtime settings (e.g. max_tokens)."""
    global engine
    data = request.json or {}
    changed = []

    if "max_tokens" in data:
        val = int(data["max_tokens"])
        val = max(50, min(300, val))   # clamp to [50, 300]
        engine.max_tokens = val
        changed.append(f"max_tokens={val}")

    if "model" in data:
        val = str(data["model"])
        engine.model = val
        changed.append(f"model={val}")

    if engine.adventure_id:
        engine.save()

    return jsonify({"status": "success", "changed": changed})


if __name__ == "__main__":
    # Bind to localhost during mock testing to avoid firewall permission/network lookup delays
    host = "127.0.0.1" if os.getenv("MOCK_LLM") == "1" else "0.0.0.0"
    app.run(host=host, port=5001, debug=True)
