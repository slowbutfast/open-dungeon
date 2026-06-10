import os
import sys
import select
import tty
import termios
import shutil
import math

def read_key():
    """Reads a single keypress from standard input including escape sequences using unbuffered reads."""
    try:
        fd = sys.stdin.fileno()
        is_tty = os.isatty(fd)
    except Exception:
        try:
            is_tty = os.isatty(0)
        except Exception:
            is_tty = False

    if not is_tty:
        try:
            ch = sys.stdin.read(1)
            return ch
        except Exception:
            return ""

    old_settings = termios.tcgetattr(fd)
    try:
        tty.setraw(fd, termios.TCSANOW)
        rlist, _, _ = select.select([fd], [], [], None)
        if rlist:
            b = os.read(fd, 1)
            if b == b'\x1b':
                rlist2, _, _ = select.select([fd], [], [], 0.05)
                if rlist2:
                    b2 = os.read(fd, 1)
                    if b2 == b'[':
                        seq = b"\x1b["
                        while True:
                            rlist3, _, _ = select.select([fd], [], [], 0.05)
                            if rlist3:
                                b3 = os.read(fd, 1)
                                seq += b3
                                if b3 in (b'A', b'B', b'C', b'D', b'~'):
                                    break
                                if len(seq) > 10:
                                    break
                            else:
                                break
                        return seq.decode('utf-8', errors='ignore')
                    return (b + b2).decode('utf-8', errors='ignore')
                return b.decode('utf-8', errors='ignore')
            return b.decode('utf-8', errors='ignore')
    finally:
        termios.tcsetattr(fd, termios.TCSANOW, old_settings)
    return ""

def read_key_nonblocking():
    """Reads a keypress from standard input without blocking. Returns the key or None."""
    try:
        fd = sys.stdin.fileno()
        is_tty = os.isatty(fd)
    except Exception:
        try:
            is_tty = os.isatty(0)
        except Exception:
            is_tty = False

    if not is_tty:
        return None

    old_settings = termios.tcgetattr(fd)
    try:
        tty.setraw(fd, termios.TCSANOW)
        rlist, _, _ = select.select([fd], [], [], 0.0)
        if rlist:
            b = os.read(fd, 1)
            if b == b'\x1b':
                rlist2, _, _ = select.select([fd], [], [], 0.05)
                if rlist2:
                    b2 = os.read(fd, 1)
                    if b2 == b'[':
                        seq = b"\x1b["
                        while True:
                            rlist3, _, _ = select.select([fd], [], [], 0.05)
                            if rlist3:
                                b3 = os.read(fd, 1)
                                seq += b3
                                if b3 in (b'A', b'B', b'C', b'D', b'~'):
                                    break
                                if len(seq) > 10:
                                    break
                            else:
                                break
                        return seq.decode('utf-8', errors='ignore')
                    return (b + b2).decode('utf-8', errors='ignore')
                return b.decode('utf-8', errors='ignore')
            return b.decode('utf-8', errors='ignore')
    except Exception:
        pass
    finally:
        termios.tcsetattr(fd, termios.TCSANOW, old_settings)
    return None

def check_stream_scroll(scroll_state):
    """Placeholder helper to maintain compatibility, returns False since terminal handles scroll."""
    return False

def get_interactive_input(engine, scroll_state, command_history=None):
    """Inline raw keyboard input loop mimicking a classic terminal command line prompt."""
    if command_history is None:
        command_history = []
        
    input_buffer = ""
    saved_typed = ""
    history_idx = len(command_history)
    
    prompt_text = "> "
    
    sys.stdout.write(prompt_text)
    sys.stdout.flush()
    
    while True:
        key = read_key()
        if not key:
            continue
            
        if key == "\x03":  # Ctrl+C
            raise KeyboardInterrupt
            
        elif key in ("\r", "\n"):  # Enter
            sys.stdout.write("\n")
            sys.stdout.flush()
            cleaned_input = input_buffer.strip()
            
            # Suggestion selection support (keeps tests passing)
            if getattr(engine, "suggestions", None) and isinstance(engine.suggestions, list) and len(engine.suggestions) > 0:
                if cleaned_input in ("1", "2", "3"):
                    selected = engine.suggestions[int(cleaned_input) - 1]
                    engine.suggestions = []
                    return selected
            
            if hasattr(engine, "suggestions"):
                engine.suggestions = []
                
            if cleaned_input:
                if not command_history or command_history[-1] != input_buffer:
                    command_history.append(input_buffer)
            return input_buffer
            
        elif key in ("\x7f", "\x08"):  # Backspace
            if len(input_buffer) > 0:
                input_buffer = input_buffer[:-1]
                saved_typed = input_buffer
                history_idx = len(command_history)
                sys.stdout.write(f"\r\x1b[K{prompt_text}{input_buffer}")
                sys.stdout.flush()
                
        elif key == "\x1b[A":  # Up Arrow -> scroll state update (tests verification)
            if scroll_state is not None:
                scroll_state["offset"] += 3
                
        elif key == "\x1b[B":  # Down Arrow -> scroll state update
            if scroll_state is not None:
                scroll_state["offset"] = max(0, scroll_state["offset"] - 3)
                
        elif key == "\x1b[D":  # Left Arrow -> History Prev
            if command_history and history_idx > 0:
                if history_idx == len(command_history):
                    saved_typed = input_buffer
                history_idx -= 1
                input_buffer = command_history[history_idx]
                sys.stdout.write(f"\r\x1b[K{prompt_text}{input_buffer}")
                sys.stdout.flush()
                
        elif key == "\x1b[C":  # Right Arrow -> History Next
            if command_history and history_idx < len(command_history):
                history_idx += 1
                if history_idx == len(command_history):
                    input_buffer = saved_typed
                else:
                    input_buffer = command_history[history_idx]
                sys.stdout.write(f"\r\x1b[K{prompt_text}{input_buffer}")
                sys.stdout.flush()
                
        elif len(key) == 1 and key.isprintable():  # Character typing
            input_buffer += key
            saved_typed = input_buffer
            history_idx = len(command_history)
            sys.stdout.write(key)
            sys.stdout.flush()


try:
    import readline
except ImportError:
    readline = None


def get_interactive_edit(prompt_text, default_text=""):
    """
    An interactive input prompt pre-populated with default_text using python's built-in readline.
    Reuses standard terminal input shortcuts (navigation, delete words, etc.) handled natively.
    """
    try:
        fd = sys.stdin.fileno()
        is_tty = os.isatty(fd)
    except Exception:
        try:
            is_tty = os.isatty(0)
        except Exception:
            is_tty = False

    if not is_tty or readline is None:
        # Fallback for non-TTY or environments without readline support
        sys.stdout.write(prompt_text + default_text)
        sys.stdout.flush()
        try:
            return sys.stdin.readline().rstrip('\r\n')
        except Exception:
            return default_text

    # Pre-populate the input buffer by setting a startup hook
    readline.set_startup_hook(lambda: readline.insert_text(default_text))
    try:
        return input(prompt_text)
    except (KeyboardInterrupt, EOFError) as e:
        if isinstance(e, KeyboardInterrupt):
            raise KeyboardInterrupt
        return default_text
    finally:
        # Clean up startup hook so subsequent standard inputs are not affected
        readline.set_startup_hook(None)
