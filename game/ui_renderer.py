import re
from rich.console import Console
from rich.panel import Panel
from rich.layout import Layout
from rich.text import Text

console = Console()

# Ascii Art Header
RETRO_BANNER = """
[bold green]
 ▐▄▄▄ ▄▄▄·  ·▄▄▄▄  ▄• ▄▌ ▐ ▄  ▄▄ • ▄▄▄ . ▄▄▄▄▄ ▐▄▄▄ 
  ·██▐█ ▀█  ██· ██ █▪██▌•█▌▐█▐█ ▀ ▪▀▄.▀·•██  ·██    
 ▐▄ █·▄█▀▀█  ▐█▪ ██ █▌▐█▌▐█▐▐▌▄█ ▀█▄▐▀▀▪▄ ██  ▐█▪     
  ▐█▌·▐█ ▪ ▐▌▐█▌ ██ ▐█▄█▌██▐█▌▐█▄▪▐█▐█▄▄▌ ▐█.▪ ▐█▌·    
   ▀   ▀  ▀  ▀▀▀▀▀•  ▀▀▀ ▀▀ █▪·▀▀▀▀  ▀▀▀   ▀   ▀      
[/bold green]
"""

def markdown_to_rich(text):
    """Converts basic markdown formatting into rich text markup tags."""
    # Headings
    text = re.sub(r'^###\s*(.*?)$', r'[bold green]■ \1 ■[/bold green]', text, flags=re.MULTILINE)
    text = re.sub(r'^##\s*(.*?)$', r'[bold green]■ \1 ■[/bold green]', text, flags=re.MULTILINE)
    text = re.sub(r'^#\s*(.*?)$', r'[bold green]■ \1 ■[/bold green]', text, flags=re.MULTILINE)
    
    # Bold-italic: ***text***
    text = re.sub(r'\*\*\*(.*?)\*\*\*', r'[bold italic]\1[/bold italic]', text)
    text = re.sub(r'___(.*?)___', r'[bold italic]\1[/bold italic]', text)
    
    # Bold: **text**
    text = re.sub(r'\*\*(.*?)\*\*', r'[bold]\1[/bold]', text)
    text = re.sub(r'__(.*?)__', r'[bold]\1[/bold]', text)
    
    # Italic: *text*
    text = re.sub(r'\*(.*?)\*', r'[italic]\1[/italic]', text)
    text = re.sub(r'_(.*?)_', r'[italic]\1[/italic]', text)
    
    # Bullet points: * item -> • item
    text = re.sub(r'^\s*[\*\-]\s+', r'• ', text, flags=re.MULTILINE)
    
    return text

def limit_story_height(story_markup, console_width, console_height, scroll_offset=0, scroll_state=None, options_active=False):
    """Wraps the story text and limits its height to fit the Story Monitor panel."""
    # The Story Monitor occupies the entire width of the terminal
    panel_width = console_width - 4
    # Height is the console height minus headers, footers, borders, and margins
    panel_height = console_height - (16 if options_active else 10)
    
    if panel_width <= 0 or panel_height <= 0:
        if scroll_state is not None:
            scroll_state["offset"] = 0
            scroll_state["max_scroll"] = 0
        return story_markup
        
    try:
        # Parse the rich markup into a Text object
        rich_text = Text.from_markup(story_markup)
        
        # Wrap using rich's built-in wrapper which respects color tags
        wrapped_lines = list(rich_text.wrap(console, panel_width))
        
        total_wrapped = len(wrapped_lines)
        if scroll_state is not None:
            old_total = scroll_state.get("last_total_lines", 0)
            if old_total > 0 and total_wrapped > old_total:
                scroll_offset += (total_wrapped - old_total)

        if total_wrapped <= panel_height:
            if scroll_state is not None:
                scroll_state["offset"] = 0
                scroll_state["max_scroll"] = 0
                scroll_state["last_total_lines"] = total_wrapped
            return Text("\n").join(wrapped_lines).markup
            
        # We need to crop and possibly add indicators
        # Let's determine the visible height budget.
        # If scroll_offset > 0: we need a top and a bottom indicator (budget = panel_height - 2)
        # If scroll_offset == 0: we need only a top indicator (budget = panel_height - 1)
        budget = panel_height - 2
        max_scroll = total_wrapped - budget
        clamped_offset = max(0, min(scroll_offset, max_scroll))
        
        if clamped_offset == 0:
            budget = panel_height - 1
            max_scroll = total_wrapped - budget
            clamped_offset = 0
            
        # Extract the lines
        start_idx = total_wrapped - budget - clamped_offset
        end_idx = total_wrapped - clamped_offset
        display_lines = wrapped_lines[start_idx:end_idx]
        
        # Build indicators
        if clamped_offset > 0:
            top_indicator = Text.from_markup(
                f"[dim green]▲ ▲ ▲ [SCROLLED UP] Older lines hidden. Enter /up or /pgup. Offset: {clamped_offset}/{max_scroll} ▲ ▲ ▲[/dim green]"
            )
            bottom_indicator = Text.from_markup(
                f"[dim green]▼ ▼ ▼ [SCROLLED UP] {clamped_offset} newer line(s) hidden. Enter /down or /bottom to return ▼ ▼ ▼[/dim green]"
            )
            display_lines.insert(0, top_indicator)
            display_lines.append(bottom_indicator)
        else:
            top_indicator = Text.from_markup(
                f"[dim green]<< [AUTO-SCROLLED] Older lines hidden. Enter /up or /pgup to scroll up. >>[/dim green]"
            )
            display_lines.insert(0, top_indicator)
            
        if scroll_state is not None:
            scroll_state["offset"] = clamped_offset
            scroll_state["max_scroll"] = max_scroll
            scroll_state["last_total_lines"] = total_wrapped
            
        return Text("\n").join(display_lines).markup
    except Exception as e:
        if scroll_state is not None:
            scroll_state["offset"] = 0
            scroll_state["max_scroll"] = 0
        return story_markup

def make_layout(engine, streaming_text="", system_msg="", is_querying=False, scroll_state=None):
    """Generates the split panel layout for the retro CLI."""
    # Header Panel
    header_content = f"Prompts before compaction: [bold green]{engine.summarize_threshold - len(engine.history)}[/bold green]"
    header = Panel(
        header_content,
        title="[bold green]■ TERMINAL LINK ■[/bold green]",
        title_align="center",
        border_style="green"
    )
    
    # Story Panel
    story_content = ""
    if engine.summary:
        story_content += "[dim green]<< Historical log compressed and summarized >>[/dim green]\n\n"
        
    for turn in engine.history:
        if turn["role"] == "user":
            story_content += f"[bold green]{turn['text']}[/bold green]\n"
        else:
            story_content += f"[green]{markdown_to_rich(turn['text'])}[/green]\n\n"
            
    # Include current stream or status
    if streaming_text:
        story_content += f"[green]{markdown_to_rich(streaming_text)}[/green]"
    elif is_querying:
        story_content += "\n[bold blink green]>> CONNECTING TO NEURAL LINK / RETRIEVING DATA...[/bold blink green]"
        
    # Crop the story text to prevent overflow
    scroll_offset = scroll_state.get("offset", 0) if scroll_state is not None else 0
    options_active = getattr(engine, "suggestions", None) and isinstance(engine.suggestions, list) and len(engine.suggestions) > 0
    story_content_trimmed = limit_story_height(story_content, console.width, console.height, scroll_offset=scroll_offset, scroll_state=scroll_state, options_active=options_active)
    
    story_panel = Panel(
        story_content_trimmed,
        title="[bold green]■ STORY MONITOR ■[/bold green]",
        border_style="green"
    )
    
    # Main Body (story panel occupies the entire width)
    body = Layout(story_panel)
    
    # Footer Panel
    footer_text = (
        "[bold green]Gameplay Actions:[/bold green] `/do <action>` (or `/d`), `/say <speech>` (or `/s`), `/story <desc>` (or `/w`)\n"
        "[bold green]Commands:[/bold green] `/undo`, `/retry`, `/scan`, `/lore`, `/summary`, `/system`, `/save`, `/load`, `/help`, `/quit`, `/scroll`"
    )
    if system_msg:
        footer_text = f"[bold green]SYSTEM REPORT: {system_msg}[/bold green]\n{footer_text}"
        
    footer = Panel(
        footer_text,
        title="[bold green]■ SYS CONSOLE COMMAND REFERENCE ■[/bold green]",
        border_style="green"
    )
    
    # Options Panel if suggestions are present
    options_panel = None
    if getattr(engine, "suggestions", None) and isinstance(engine.suggestions, list) and len(engine.suggestions) > 0:
        options_text = ""
        for idx, opt in enumerate(engine.suggestions):
            options_text += f"[bold green][{idx+1}][/bold green] {opt}\n"
        options_text += "[dim green](Type 1, 2, or 3 to select, or enter your custom action/command below)[/dim green]"
        options_panel = Panel(
            options_text,
            title="[bold green]■ SUGGESTED ACTIONS ■[/bold green]",
            border_style="green"
        )
        
    # Assemble
    layout = Layout()
    if options_panel:
        layout.split_column(
            Layout(header, size=3),
            Layout(body),
            Layout(options_panel, size=6),
            Layout(footer, size=5 if system_msg else 4)
        )
    else:
        layout.split_column(
            Layout(header, size=3),
            Layout(body),
            Layout(footer, size=5 if system_msg else 4)
        )
    
    return layout

import os
import sys

def init_terminal():
    """Sets terminal scroll margins to keep row 1 fixed for status bar, scrolling rows 2+."""
    # Clear screen
    sys.stdout.write("\x1b[2J")
    # Set scroll margin from row 2 to bottom dynamically
    sys.stdout.write("\x1b[2;r")
    # Move cursor to row 2, col 1
    sys.stdout.write("\x1b[2;1H")
    sys.stdout.flush()

def reset_terminal():
    """Resets terminal scroll margins to default full screen."""
    sys.stdout.write("\x1b[r")
    try:
        size = os.get_terminal_size()
        rows = size.lines
    except Exception:
        rows = 24
    sys.stdout.write(f"\x1b[{rows};1H\n")
    sys.stdout.flush()

def draw_status_bar(location, score, moves):
    """Draws a reverse-video status bar on row 1 of the terminal screen."""
    try:
        size = os.get_terminal_size()
        cols = size.columns
    except Exception:
        cols = 80
        
    left_str = f" {location}"
    right_str = f"Score: {score}   Moves: {moves} "
    
    spaces = cols - len(left_str) - len(right_str)
    if spaces < 0:
        spaces = 1
        
    status_str = left_str + (" " * spaces) + right_str
    status_str = status_str[:cols]
    
    # Save cursor, move to (1, 1), write status bar in reverse video, restore cursor
    sys.stdout.write("\x1b7") # DEC Save cursor
    sys.stdout.write("\x1b[1;1H")
    sys.stdout.write(f"\x1b[7m{status_str}\x1b[27m")
    sys.stdout.write("\x1b8") # DEC Restore cursor
    sys.stdout.flush()
