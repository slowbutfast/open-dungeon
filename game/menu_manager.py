import time
import sys
import re
from rich.prompt import Prompt, Confirm
from ui_renderer import console, markdown_to_rich
from adventure_engine import DEFAULT_SYSTEM_PROMPT
from input_handler import get_interactive_edit

# Story Presets and Character Selection Systems
STORY_PRESETS = [
    {
        "name": "Lord of the Rings (Middle-earth Fantasy)",
        "title": "Middle-earth: Fellowship Quest",
        "summary": "An ancient Ring of Power must be carried to Mount Doom in Mordor to destroy the Dark Lord Sauron. You start in the peaceful hills of the Shire, receiving a warning from Gandalf.",
        "system_prompt": "You are the narrator for a Lord of the Rings text adventure in the style of Zork. Describe Middle-earth with details about hobbits, elves, dwarves, and dark riders, keeping the tone heroic yet sarcastic and curt. Keep responses very concise.\n\nExample 1:\nPlayer: open mailbox\nNarrator: Opening the small mailbox reveals a leaflet.\n[Status: West of House | Score: 0]\n\nExample 2:\nPlayer: take leaflet\nNarrator: Taken.\n[Status: West of House | Score: 0]\n\nExample 3:\nPlayer: go north\nNarrator: North of House\nYou are facing the north side of a white house. A forest stretches to the north.\n[Status: North of House | Score: 0]\n\nUse the second-person perspective (\"You\"). Never write dialogue or actions for the player. At the very end of EVERY response, on a new line, you MUST append the current status in this exact format: [Status: <Location Name> | Score: <Current Score>]",
        "characters": [
            {"name": "Thorne", "type": "Dwarf Warrior", "desc": "A stout dwarf warrior with a braided beard, heavily armored, carrying a double-bladed battleaxe.", "triggers": ["thorne", "dwarf", "battleaxe"]},
            {"name": "Elandra", "type": "Elf Ranger", "desc": "A silent elf ranger wearing a green cloak, wielding a longbow, and skilled in tracking.", "triggers": ["elandra", "ranger", "longbow"]},
            {"name": "Valerius", "type": "Human Cleric", "desc": "A human cleric of the Sun God, wearing chainmail, wielding a warhammer, and capable of healing wounds.", "triggers": ["valerius", "cleric", "warhammer"]},
            {"name": "Mirabella", "type": "Hobbit Rogue", "desc": "A quick-footed hobbit rogue who stealths in shadows, carries dual daggers, and has a knack for lockpicking.", "triggers": ["mirabella", "hobbit", "rogue"]}
        ]
    },
    {
        "name": "Cyberpunk: Neon Shadows (Gritty Sci-Fi)",
        "title": "Cyberpunk: Neon Shadows",
        "summary": "In the corporate-ruled sprawl of Night City, you have stolen a prototype biochip that holds digital immortality, but is slowly overwriting your brain. You are hiding in a cheap motel.",
        "system_prompt": "You are the narrator for a Cyberpunk text adventure in the style of Zork. Describe Night City with neon, street slang, implants, and tech, keeping the tone gritty, sarcastic, and curt. Keep responses very concise.\n\nExample 1:\nPlayer: open mailbox\nNarrator: Opening the small mailbox reveals a leaflet.\n[Status: West of House | Score: 0]\n\nExample 2:\nPlayer: take leaflet\nNarrator: Taken.\n[Status: West of House | Score: 0]\n\nExample 3:\nPlayer: go north\nNarrator: North of House\nYou are facing the north side of a white house. A forest stretches to the north.\n[Status: North of House | Score: 0]\n\nUse the second-person perspective (\"You\"). Never write dialogue or actions for the player. At the very end of EVERY response, on a new line, you MUST append the current status in this exact format: [Status: <Location Name> | Score: <Current Score>]",
        "characters": [
            {"name": "Kaelen", "type": "Solo Merc", "desc": "A heavily augmented solo merc with mantis blades, a smart-smg, and subdermal armor.", "triggers": ["kaelen", "solo", "smg", "blades"]},
            {"name": "Valkyrie", "type": "Netrunner", "desc": "A skilled netrunner with a cyberdeck installed, capable of hacking security cameras, turrets, and implants.", "triggers": ["valkyrie", "netrunner", "cyberdeck"]},
            {"name": "Jax", "type": "Techie", "desc": "A rogue technician with a mechanical drone helper, carrying an electro-shock pistol and tools to hotwire anything.", "triggers": ["jax", "techie", "drone"]},
            {"name": "Syn", "type": "Street Kid", "desc": "A charismatic street kid with synthetic gold eyes, a silenced pistol, and contacts across every gang in the city.", "triggers": ["syn", "street kid", "pistol"]}
        ]
    },
    {
        "name": "Star Wars: Coruscant Underworld (Mandalorian)",
        "title": "Star Wars: Coruscant Underworld",
        "summary": "The heat is high on Coruscant. Your last smuggling run exploded in your face — the crate of restricted starship components turned out to be Imperial military transponders, and the Bureau of Imperial Security tracked your signature before you scrambled your ship's transponder and ditched it in a commercial docking bay. Now your ship is locked down, the sector is crawling with security droids, and your credits are running thin. You cannot leave Level 1313 until the Imperial patrol grids shift.",
        "system_prompt": "You are the narrator for a Star Wars underworld text adventure in the style of Zork. Describe Coruscant's neon-choked lower levels, Imperial patrols, security droids, and gritty safehouses, keeping the tone tense, sarcastic, and curt. Keep responses very concise.\n\nExample 1:\nPlayer: open mailbox\nNarrator: Opening the small mailbox reveals a leaflet.\n[Status: West of House | Score: 0]\n\nExample 2:\nPlayer: take leaflet\nNarrator: Taken.\n[Status: West of House | Score: 0]\n\nExample 3:\nPlayer: go north\nNarrator: North of House\nYou are facing the north side of a white house. A forest stretches to the north.\n[Status: North of House | Score: 0]\n\nUse the second-person perspective (\"You\"). Never write dialogue or actions for the player. At the very end of EVERY response, on a new line, you MUST append the current status in this exact format: [Status: <Location Name> | Score: <Current Score>]",
        "characters": [
            {"name": "Rex", "type": "Mandalorian Outcast", "desc": "A disgraced Mandalorian foundling stripped of his clan crest, wearing scratched beskar armor and carrying a customized DC-17 blaster pistol.", "triggers": ["rex", "mandalorian", "beskar", "dc-17"]},
            {"name": "Liss", "type": "Underworld Fixer", "desc": "A weasley Devaronian info-broker with a cybernetic eye implant, always a step ahead of sector patrols and willing to trade secrets for credits.", "triggers": ["liss", "fixer", "devaronian", "info"]},
            {"name": "Vex", "type": "Salvage Tech", "desc": "A goggle-wearing mechanic who can hotwire docking bay doors, reroute power grids, and make a hyperdrive sing with scrap parts. Carries a jury-rigged ion pistol.", "triggers": ["vex", "tech", "mechanic", "ion"]},
            {"name": "Mors", "type": "Former Imperial Officer", "desc": "A disgraced Imperial logistics officer who fled the Bureau of Imperial Security with a datachip full of patrol schedules and cargo manifests.", "triggers": ["mors", "officer", "imperial", "datachip"]}
        ]
    },
    {
        "name": "Star Wars: The Outer Rim (Space Opera)",
        "title": "Star Wars: The Outer Rim",
        "summary": "The Galactic Empire rules the galaxy. On the desert world of Tatooine, you have stumbled upon a Rebel holocron containing secret coordinates. Stormtroopers are searching the area.",
        "system_prompt": "You are the narrator for a Star Wars space opera text adventure in the style of Zork. Describe hyperdrives, blasters, stormtroopers, and the Force, keeping the tone epic, sarcastic, and curt. Keep responses very concise.\n\nExample 1:\nPlayer: open mailbox\nNarrator: Opening the small mailbox reveals a leaflet.\n[Status: West of House | Score: 0]\n\nExample 2:\nPlayer: take leaflet\nNarrator: Taken.\n[Status: West of House | Score: 0]\n\nExample 3:\nPlayer: go north\nNarrator: North of House\nYou are facing the north side of a white house. A forest stretches to the north.\n[Status: North of House | Score: 0]\n\nUse the second-person perspective (\"You\"). Never write dialogue or actions for the player. At the very end of EVERY response, on a new line, you MUST append the current status in this exact format: [Status: <Location Name> | Score: <Current Score>]",
        "characters": [
            {"name": "Jaxen", "type": "Jedi Survivor", "desc": "A hidden Jedi padawan in exile, carrying a blue lightsaber and wielding Force telekinesis.", "triggers": ["jaxen", "jedi", "lightsaber", "force"]},
            {"name": "Barton", "type": "Smuggler", "desc": "A cynical smuggler pilot carrying a modified blaster pistol, possessing a fast starship and quick reflexes.", "triggers": ["barton", "smuggler", "blaster"]},
            {"name": "T-8R", "type": "Security Droid", "desc": "A reprogrammed imperial security droid equipped with a heavy repeating blaster and thick armor plating.", "triggers": ["t-8r", "droid", "rifle"]},
            {"name": "Kira", "type": "Bounty Hunter", "desc": "A Mandalorian bounty hunter wearing beskar armor, equipped with a jetpack and wrist flamethrower.", "triggers": ["kira", "hunter", "jetpack"]}
        ]
    }
]

def show_help_screen():
    """Prints help documentation directly to standard output scrollback."""
    help_content = """
--- TERMINAL HANDBOOK ---
Welcome to the Retro CLI Zork-like Adventure!

GAMEPLAY ACTIONS:
  - Just type your action directly (e.g. "open mailbox", "go north", "read leaflet").
  - Do not use slash command prefixes for normal gameplay.

SYSTEM COMMANDS:
  - /undo         : Revert your last action and the AI's response.
  - /retry        : Regenerate the AI's last response.
  - /continue     : Let the story generate a response on its own (or press ENTER with no command).
  - /auto         : Autoplay mode. Automatically generates turns. Press any key to stop.
  - /scan         : Scans recent history and auto-generates character/location Lore Cards.
  - /lore         : Manage the Lorebook (add, edit, or delete context cards manually).
  - /summary      : Manually view or overwrite the adventure's compressed memory summary.
  - /system       : View or edit the active Dungeon Master system prompt.
  - /save         : Force save game state.
  - /load         : Display saved games and load/delete them.
  - /menu         : Save and return to the main startup menu.
  - /help         : View this handbook.
  - /quit         : Save and quit.
"""
    console.print(help_content)

def handle_summary_edit(engine):
    """Enables editing of the adventure summary via text prompt."""
    print("\n--- CURRENT ADVENTURE COMPRESSED MEMORY ---")
    print(engine.summary or "[No summary yet]")
    print("------------------------------------------")
    flat_summary = engine.summary.replace('\n', '\\n') if engine.summary else ""
    new_summary = get_interactive_edit("Enter updated summary: ", flat_summary).strip()
    if new_summary:
        engine.summary = new_summary.replace('\\n', '\n')
        engine.save()
        return "Memory summary updated successfully."
    return None

def handle_lore_menu(engine):
    """Interact with context cards manually (add, edit, delete) using simple CLI prints."""
    while True:
        print("\n--- ACTIVE LORE CARDS ---")
        if not engine.cards:
            print("[No lore cards active.]")
        else:
            for idx, c in enumerate(engine.cards):
                status = "●" if c.get("enabled", True) else "○"
                print(f"[{idx}] {status} {c['name'].upper()} ({c['type']})")
                print(f"    Triggers: {', '.join(c.get('trigger_words', []))}")
                print(f"    Desc: {c.get('description', '')}")
        print("-------------------------")
        print("Options: [1] Add Card [2] Delete Card [3] Toggle Card [4] Edit Card [5] Return to Game")
        choice = Prompt.ask("Select option", choices=["1", "2", "3", "4", "5"], default="5")
        
        if choice == "1":
            name = get_interactive_edit("Entity Name: ").strip()
            if not name:
                continue
            card_type = Prompt.ask("Type", choices=["character", "location", "item", "lore"], default="character")
            description = get_interactive_edit("Description: ").strip()
            triggers_str = get_interactive_edit("Trigger words (comma separated): ").strip()
            triggers = [t.strip() for t in triggers_str.split(",") if t.strip()]
            if name and description:
                engine.add_manual_card(name, card_type, description, triggers)
                
        elif choice == "2":
            if not engine.cards:
                continue
            idx_str = Prompt.ask("Enter card index to delete").strip()
            try:
                idx = int(idx_str)
                if 0 <= idx < len(engine.cards):
                    card_id = engine.cards[idx]["id"]
                    engine.delete_card(card_id)
            except ValueError:
                pass
                
        elif choice == "3":
            if not engine.cards:
                continue
            idx_str = Prompt.ask("Enter card index to toggle").strip()
            try:
                idx = int(idx_str)
                if 0 <= idx < len(engine.cards):
                    engine.cards[idx]["enabled"] = not engine.cards[idx].get("enabled", True)
                    engine.save()
            except ValueError:
                pass
                
        elif choice == "4":
            if not engine.cards:
                continue
            idx_str = Prompt.ask("Enter card index to edit").strip()
            try:
                idx = int(idx_str)
                if 0 <= idx < len(engine.cards):
                    card = engine.cards[idx]
                    print(f"\nEditing Card: {card['name']}")
                    new_name = get_interactive_edit("Entity Name: ", card["name"]).strip()
                    new_type = Prompt.ask("Type", choices=["character", "location", "item", "lore"], default=card.get("type", "character"))
                    new_desc = get_interactive_edit("Description: ", card.get("description", "")).strip()
                    default_triggers = ", ".join(card.get("trigger_words", []))
                    new_triggers_str = get_interactive_edit("Trigger words (comma separated): ", default_triggers).strip()
                    new_triggers = [t.strip() for t in new_triggers_str.split(",") if t.strip()]
                    if new_name and new_desc:
                        card["name"] = new_name
                        card["type"] = new_type
                        card["description"] = new_desc
                        card["trigger_words"] = new_triggers
                        engine.save()
                        print("Card updated successfully.")
            except ValueError:
                pass
                
        elif choice == "5":
            break
            
    return "Lorebook modifications finalized."

def prompt_edit_text(title_label, default_text):
    """Allows manual editing of prompt text via terminal print/input."""
    print(f"\n--- {title_label} ---")
    flat_text = default_text.replace('\n', '\\n')
    new_text = get_interactive_edit("> ", flat_text).strip()
    if not new_text:
        return default_text
    return new_text.replace('\\n', '\n')

def setup_new_adventure(engine):
    """Guide the user through selecting a preset story, system prompt, and character using plain text CLI."""
    print("\n--- STORY GENESIS PRESETS ---")
    for idx, preset in enumerate(STORY_PRESETS):
        print(f"[{idx+1}] {preset['name']}")
        print(f"    Scenario: {preset['summary'][:90]}...")
    print("[5] Custom Adventure (Define your own universe/rules)")
    print("[6] Return to Start Menu")
    choice = Prompt.ask("Select story preset option", choices=["1", "2", "3", "4", "5", "6"], default="1")

    if choice == "6":
        return False
    
    title = "New Adventure"
    summary = ""
    system_prompt = DEFAULT_SYSTEM_PROMPT
    characters = [
        {"name": "Valen", "type": "Warrior", "desc": "A strong fighter with a steel sword and shield.", "triggers": ["valen", "warrior", "sword"]},
        {"name": "Garrick", "type": "Mage", "desc": "A spellcaster wielding a wooden staff and fire spells.", "triggers": ["garrick", "mage", "staff"]},
        {"name": "Lyra", "type": "Rogue", "desc": "A stealthy thief wielding dual daggers.", "triggers": ["lyra", "rogue", "daggers"]},
        {"name": "Doran", "type": "Scholar", "desc": "An intelligent investigator carrying a journal and pistol.", "triggers": ["doran", "scholar", "pistol"]}
    ]
    
    if choice in ("1", "2", "3", "4"):
        selected_preset = STORY_PRESETS[int(choice) - 1]
        title = selected_preset["title"]
        summary = selected_preset["summary"]
        system_prompt = selected_preset["system_prompt"]
        characters = selected_preset["characters"]
        
        print(f"\nPreset Scenario: {summary}")
        customize = Confirm.ask("Would you like to customize this story universe details?", default=False)
        if customize:
            title = get_interactive_edit("Enter adventure title: ", title).strip()
            flat_summary = summary.replace('\n', '\\n') if summary else ""
            summary = get_interactive_edit("Enter starting scenario / summary: ", flat_summary).strip()
            summary = summary.replace('\\n', '\n')
    else:
        title = get_interactive_edit("Enter adventure title: ", "Custom Quest").strip()
        summary = get_interactive_edit("Enter starting scenario / summary: ", "You stand at the beginning of a mysterious custom quest.").strip()
        summary = summary.replace('\\n', '\n')
        system_prompt = DEFAULT_SYSTEM_PROMPT
        
    # Present system prompt
    print(f"\nActive system prompt instructions:\n{system_prompt}")
    edit_sys = Confirm.ask("Would you like to customize this System Prompt?", default=False)
    if edit_sys:
        system_prompt = prompt_edit_text("EDIT SYSTEM PROMPT", system_prompt)
        
    # Select Character
    print("\n--- CHARACTER GENESIS ---")
    for idx, char in enumerate(characters[:3]):
        print(f"[{idx+1}] {char['name']} ({char['type']}) - {char['desc']}")
    print("[4] Custom Character (Define your own hero)")
    print("[5] Return to Start Menu")
    char_choice = Prompt.ask("Select character option", choices=["1", "2", "3", "4", "5"], default="1")
    
    if char_choice == "5":
        return False
        
    char_name = ""
    char_type = ""
    char_desc = ""
    char_triggers = []
    
    if char_choice in ("1", "2", "3"):
        char_data = characters[int(char_choice) - 1]
        char_name = char_data["name"]
        char_type = char_data["type"]
        char_desc = char_data["desc"]
        char_triggers = char_data["triggers"]
        
        print(f"\nCharacter Name: {char_name}\nClass/Role: {char_type}\nDescription: {char_desc}")
        customize_char = Confirm.ask("Would you like to customize this character?", default=False)
        if customize_char:
            char_name = get_interactive_edit("Enter character name: ", char_name).strip()
            char_type = get_interactive_edit("Enter character class/role: ", char_type).strip()
            char_desc = get_interactive_edit("Enter character description: ", char_desc).strip()
            triggers_str = get_interactive_edit("Enter trigger words (comma separated): ", ", ".join(char_triggers)).strip()
            char_triggers = [t.strip() for t in triggers_str.split(",") if t.strip()]
            if not char_triggers:
                char_triggers = [char_name.lower()]
    else:
        char_name = get_interactive_edit("Enter character name: ", "Eldrin").strip()
        char_type = get_interactive_edit("Enter character class/role: ", "Mage").strip()
        char_desc = get_interactive_edit("Enter character description: ", "A mysterious wizard wearing robes.").strip()
        triggers_str = get_interactive_edit("Enter trigger words (comma separated): ", char_name.lower()).strip()
        char_triggers = [t.strip() for t in triggers_str.split(",") if t.strip()]
        if not char_triggers:
            char_triggers = [char_name.lower()]
            
    current_adv_id = None
    while True:
        if current_adv_id:
            engine.delete_adventure(current_adv_id)
            current_adv_id = None
            
        engine.history = []
        engine.suggestions = []
        current_adv_id = engine.new_adventure(title, system_prompt)
        engine.summary = summary
        engine.add_manual_card(char_name, char_type, char_desc, char_triggers)
        
        intro_action = f"You are {char_name}, a {char_type}. {char_desc} You begin your adventure. {summary}"
        
        print("\n>> CONNECTING TO NEURAL LINK / GENERATING STARTING SCENE...\n")
        current_line = ""
        
        try:
            for event in engine.generate_response_stream("story", intro_action):
                if event["type"] == "system":
                    console.print(f"\n[SYSTEM: {event['content']}]", style="bold green")
                elif event["type"] == "chunk":
                    chunk = event["content"]
                    current_line += chunk
                    if "\n" in current_line:
                        lines = current_line.split("\n")
                        for line in lines[:-1]:
                            if not re.match(r'^\[Status:\s*.*\s*\|\s*Score:\s*\d+\s*\]$', line.strip()):
                                console.print(markdown_to_rich(line), style="green")
                        current_line = lines[-1]
                elif event["type"] == "done":
                    final_line = current_line.strip()
                    if not re.match(r'^\[Status:\s*.*\s*\|\s*Score:\s*\d+\s*\]$', final_line):
                        console.print(markdown_to_rich(current_line), style="green")
        except KeyboardInterrupt:
            if current_adv_id:
                engine.delete_adventure(current_adv_id)
            return False
            
        print("\nOpening scene generated.")
        print("[1] Proceed with this adventure")
        print("[2] Reroll starting scene")
        print("[3] Return to Start Menu")
        choice_confirm = Prompt.ask("Select option", choices=["1", "2", "3"], default="1")
        
        if choice_confirm == "1":
            engine.save()
            return True
        elif choice_confirm == "3":
            if current_adv_id:
                engine.delete_adventure(current_adv_id)
            return False

def handle_load_menu(engine):
    """Lists saved adventures and allows loading or deleting via text CLI."""
    while True:
        saves = engine.list_adventures()
        if not saves:
            Prompt.ask("\nNo local adventure files found. Press ENTER to return.")
            return None
            
        print("\n--- AVAILABLE SAVED ADVENTURES ---")
        for idx, s in enumerate(saves):
            print(f"[{idx}] ID: {s['id']} | {s['title']} ({s['turns']} turns)")
            print(f"    Location: {s.get('location', 'West of House')} | Score: {s.get('score', 0)} | Moves: {s.get('moves', 0)}")
            print(f"    Summary: {s['summary'][:80]}...")
        print("---------------------------------")
        print("Options: [1] Load Adventure [2] Delete Adventure [3] Return")
        choice = Prompt.ask("Select option", choices=["1", "2", "3"], default="3")
        
        if choice == "3":
            return None
        elif choice == "1":
            slot_idx = Prompt.ask("Enter index to load").strip()
            try:
                idx = int(slot_idx)
                if 0 <= idx < len(saves):
                    selected_id = saves[idx]["id"]
                    engine.load(selected_id)
                    return f"Loaded adventure: {engine.title} ({selected_id})"
            except ValueError:
                pass
        elif choice == "2":
            slot_idx = Prompt.ask("Enter index to delete").strip()
            try:
                idx = int(slot_idx)
                if 0 <= idx < len(saves):
                    selected_id = saves[idx]["id"]
                    selected_title = saves[idx]["title"]
                    confirm = Confirm.ask(f"Are you sure you want to delete adventure '{selected_title}' ({selected_id})?", default=False)
                    if confirm:
                        if engine.delete_adventure(selected_id):
                            print(f"Deleted slot {selected_id} successfully.")
            except ValueError:
                pass
