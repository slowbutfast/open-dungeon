import os
import sys
import time
import argparse
import re
from rich.prompt import Prompt, Confirm

# Ensure sibling imports work by adding script directory to sys.path
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

from adventure_engine import AdventureEngine
from ui_renderer import console, init_terminal, draw_status_bar, reset_terminal, markdown_to_rich
from input_handler import get_interactive_input, read_key_nonblocking, get_interactive_edit
from menu_manager import (
    show_help_screen,
    handle_lore_menu,
    handle_summary_edit,
    setup_new_adventure,
    handle_load_menu
)

def type_text(text, style="green", delay=0.01):
    """A helper to type out text character by character for retro CRT feel."""
    for char in text:
        console.print(char, style=style, end="")
        sys.stdout.flush()
        time.sleep(delay)
    print()

def run_game_turn(engine, action_type, text):
    """Executes a standard game turn, streams output, parses and strips status line."""
    current_line = ""
    draw_status_bar(engine.location, engine.score, engine.moves)
    
    try:
        for event in engine.generate_response_stream(action_type, text):
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
            elif event["type"] == "error":
                console.print(f"\n[AI LINK FAILURE: {event['content']}]", style="bold red")
                break
            elif event["type"] == "done":
                final_line = current_line.strip()
                if not re.match(r'^\[Status:\s*.*\s*\|\s*Score:\s*\d+\s*\]$', final_line):
                    console.print(markdown_to_rich(current_line), style="green")
                break
    except KeyboardInterrupt:
        print("\n[SYSTEM: Generation aborted by user.]")
        if engine.history and engine.history[-1]["role"] == "user":
            engine.history.pop()
            engine.save()
            
    draw_status_bar(engine.location, engine.score, engine.moves)

def run_retry_turn(engine):
    """Regenerates the last response with Zork stream parsing."""
    current_line = ""
    draw_status_bar(engine.location, engine.score, engine.moves)
    
    try:
        for event in engine.regenerate_last_response():
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
            elif event["type"] == "error":
                console.print(f"\n[AI LINK FAILURE: {event['content']}]", style="bold red")
                break
            elif event["type"] == "done":
                final_line = current_line.strip()
                if not re.match(r'^\[Status:\s*.*\s*\|\s*Score:\s*\d+\s*\]$', final_line):
                    console.print(markdown_to_rich(current_line), style="green")
                break
    except KeyboardInterrupt:
        print("\n[SYSTEM: Generation aborted by user.]")
        
    draw_status_bar(engine.location, engine.score, engine.moves)

def main():
    parser = argparse.ArgumentParser(description="AI Dungeon retro terminal CLI interface.")
    parser.add_argument("--load", type=str, help="Adventure ID to load on startup.")
    args = parser.parse_args()
    
    engine = AdventureEngine()
    
    print("OpenDungeon — in the tradition of Infocom, Inc., 1981-1983.")
    print("Revision 88 / Connection online.")
    print(f"Neural engine endpoint: {engine.client.base_url}\n")
    
    # Check connection first
    if not args.load:
        try:
            models = engine.client.models.list()
        except Exception:
            print("[ERROR: COULD NOT CONNECT TO LM STUDIO SERVER.]")
            print("Please confirm LM Studio is running and local connection bindings are set correctly.")
            sys.exit(1)

    while True:
        if args.load:
            load_id = args.load
            args.load = None
            try:
                engine.load(load_id)
                system_msg = f"Restored adventure connection: {engine.title}"
            except Exception as e:
                print(f"Failed to restore {load_id}: {e}. Returning to start menu.")
                time.sleep(2)
                continue
        else:
            print("\n--- MAIN MENU ---")
            print("[1] Begin New Adventure")
            print("[2] Restore Saved Adventure")
            print("[3] Quit")
            startup_choice = Prompt.ask("Select option", choices=["1", "2", "3"], default="1")
            
            if startup_choice == "3":
                print("Link terminated. Goodbye.")
                break
                
            elif startup_choice == "2":
                system_msg = handle_load_menu(engine)
                if not system_msg:
                    continue
            else:
                started = setup_new_adventure(engine)
                if not started:
                    continue
                system_msg = "New adventure initialized."
                
        # Initialize splitting terminal scroll margins
        init_terminal()
        draw_status_bar(engine.location, engine.score, engine.moves)
        
        # If loading game or restoring, print the log of active history
        if engine.history:
            for turn in engine.history:
                if turn["role"] == "user":
                    console.print(turn["text"], style="bold green")
                else:
                    console.print(markdown_to_rich(turn["text"]) + "\n", style="green")
                    
        if system_msg:
            console.print(f"[SYSTEM: {system_msg}]", style="bold green")
            
        scroll_state = {"offset": 0}
        command_history = []
        return_to_menu = False
        
        # Main Game Loop
        try:
            while True:
                draw_status_bar(engine.location, engine.score, engine.moves)
                action_type = None
                text = None
                
                try:
                    user_raw = get_interactive_input(engine, scroll_state, command_history=command_history).strip()
                except KeyboardInterrupt:
                    print()
                    confirm = Confirm.ask("Terminate adventure link and save?", default=True)
                    if confirm:
                        engine.save()
                        reset_terminal()
                        print("Link terminated. Adventure preserved.")
                        sys.exit(0)
                    continue
                    
                if not user_raw:
                    action_type = "continue"
                    text = ""
                # Parse commands
                elif user_raw.startswith("/"):
                    tokens = user_raw.split(maxsplit=1)
                    cmd = tokens[0].lower()
                    arg = tokens[1] if len(tokens) > 1 else ""
                    
                    if cmd in ("/quit", "/exit"):
                        engine.save()
                        reset_terminal()
                        print("Link terminated. Adventure preserved. Goodbye.")
                        sys.exit(0)
                        
                    elif cmd in ("/menu", "/mainmenu", "/startmenu"):
                        engine.save()
                        reset_terminal()
                        return_to_menu = True
                        break
                        
                    elif cmd in ("/help", "/?"):
                        show_help_screen()
                        continue
                        
                    elif cmd in ("/scroll", "/up", "/u", "/down", "/dwn", "/pgup", "/pageup", "/pgdn", "/pagedown", "/top", "/bottom"):
                        print("[SYSTEM: Classic terminal window scrollbar is supported. Use terminal mouse wheel to scroll history.]")
                        continue
                        
                    elif cmd == "/undo":
                        user_turn, ai_turn = engine.undo()
                        if user_turn:
                            print(f"[SYSTEM: Undone last turns. Reverted action: '{user_turn['text'][:40]}...']")
                        else:
                            print("[SYSTEM: Nothing to undo.]")
                        continue
                        
                    elif cmd in ("/retry", "/r"):
                        run_retry_turn(engine)
                        continue
                        
                    elif cmd == "/scan":
                        print("[SYSTEM: Initiating core lore extraction scan...]")
                        try:
                            new_cards = engine.auto_generate_cards()
                            if new_cards:
                                card_names = ", ".join([c["name"] for c in new_cards])
                                print(f"[SYSTEM: Scan complete. Found new lore cards: {card_names}]")
                            else:
                                print("[SYSTEM: Scan complete. No new entities identified.]")
                        except Exception as e:
                            print(f"[SYSTEM: Lore scan failed: {e}]")
                        continue
                        
                    elif cmd in ("/lore", "/l"):
                        # Reset margins temporarily for menus, clear screen and home cursor
                        sys.stdout.write("\x1b[r\x1b[2J\x1b[1;1H")
                        sys.stdout.flush()
                        handle_lore_menu(engine)
                        init_terminal()
                        draw_status_bar(engine.location, engine.score, engine.moves)
                        continue
                        
                    elif cmd in ("/summary", "/sum"):
                        sys.stdout.write("\x1b[r\x1b[2J\x1b[1;1H")
                        sys.stdout.flush()
                        msg = handle_summary_edit(engine)
                        init_terminal()
                        draw_status_bar(engine.location, engine.score, engine.moves)
                        if msg:
                            print(f"[SYSTEM: {msg}]")
                        continue
                        
                    elif cmd in ("/system", "/sys"):
                        sys.stdout.write("\x1b[r")
                        sys.stdout.flush()
                        print("\n--- EDIT SYSTEM PROMPT ---")
                        flat_text = engine.system_prompt.replace('\n', '\\n')
                        new_prompt = get_interactive_edit("> ", flat_text).strip()
                        if new_prompt:
                            engine.system_prompt = new_prompt.replace('\\n', '\n')
                            engine.save()
                            print("[SYSTEM: Active system prompt updated.]")
                        init_terminal()
                        draw_status_bar(engine.location, engine.score, engine.moves)
                        continue
                        
                    elif cmd == "/save":
                        engine.save()
                        print(f"[SYSTEM: Adventure state saved. ID: {engine.adventure_id}]")
                        continue
                        
                    elif cmd == "/load":
                        sys.stdout.write("\x1b[r\x1b[2J\x1b[1;1H")
                        sys.stdout.flush()
                        msg = handle_load_menu(engine)
                        init_terminal()
                        draw_status_bar(engine.location, engine.score, engine.moves)
                        if msg:
                            console.print(f"[SYSTEM: {msg}]", style="bold green")
                            if engine.history:
                                for turn in engine.history:
                                    if turn["role"] == "user":
                                        console.print(turn["text"], style="bold green")
                                    else:
                                        console.print(markdown_to_rich(turn["text"]) + "\n", style="green")
                        continue
                        
                    elif cmd in ("/continue", "/c"):
                        action_type = "continue"
                        text = ""
                    elif cmd in ("/auto", "/autoplay"):
                        try:
                            console.print("[SYSTEM: Starting autoplay mode. Press any key to pause...]", style="bold green")
                            autoplay_interrupted = False
                            while not autoplay_interrupted:
                                run_game_turn(engine, "continue", "")
                                
                                # Wait 1.5 seconds, but poll keypresses every 100ms for responsiveness
                                for _ in range(15):
                                    key = read_key_nonblocking()
                                    if key is not None:
                                        autoplay_interrupted = True
                                        break
                                    time.sleep(0.1)
                            console.print("[SYSTEM: Autoplay paused.]", style="bold green")
                        except KeyboardInterrupt:
                            console.print("\n[SYSTEM: Autoplay paused by Ctrl+C.]", style="bold green")
                        continue
                    elif cmd in ("/do", "/d"):
                        action_type = "do"
                        text = arg
                    elif cmd in ("/say", "/s"):
                        action_type = "say"
                        text = arg
                    elif cmd in ("/story", "/w"):
                        action_type = "story"
                        text = arg
                    else:
                        print(f"[SYSTEM: Unknown command: '{cmd}'. Enter `/help` to read handbook.]")
                        continue
                else:
                    action_type = "do"
                    text = user_raw
                    
                if not text and action_type != "continue":
                    print("[SYSTEM: Command action text cannot be blank.]")
                    continue
                    
                run_game_turn(engine, action_type, text)
        finally:
            reset_terminal()
            
        if return_to_menu:
            continue
        break

if __name__ == "__main__":
    main()
