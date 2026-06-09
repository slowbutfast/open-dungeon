import os
import sys

# Add parent directory to sys.path so config.py can be imported from root folder
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

import argparse
from openai import OpenAI
from config import BASE_URL

# Import Rich CLI library components
from rich.console import Console
from rich.markdown import Markdown
from rich.live import Live

console = Console()

def interactive_chat(client, system_prompt, temperature):
    console.print(f"[bold grey50]Starting interactive chat session with LM Studio...[/bold grey50]")
    console.print(f"[bold grey50]Endpoint: {BASE_URL}[/bold grey50]")
    console.print(f"[bold grey50]Type 'exit', 'quit', or press Ctrl+C to end the session.[/bold grey50]")
    console.print(f"[bold grey50]" + "="*60 + "[/bold grey50]\n")
    
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
        
    interrupted_last = False
    
    while True:
        try:
            # Use console.input to prompt the user with style
            user_input = console.input("[bold green]You:[/bold green] ")
            
            # Reset interrupt state upon successful user input
            interrupted_last = False
            
            # Handle quit commands
            if user_input.strip().lower() in ("exit", "quit"):
                console.print(f"\n[bold grey50]Exiting chat session. Goodbye![/bold grey50]")
                break
                
            if not user_input.strip():
                continue
                
            messages.append({"role": "user", "content": user_input})
            
            console.print(f"\n[bold cyan]AI:[/bold cyan]")
            
            # Query the model with streaming enabled
            stream = client.chat.completions.create(
                model="local-model",
                messages=messages,
                temperature=temperature,
                stream=True
            )
            
            # Use Live to continuously refresh the rendered Markdown inside the terminal
            assistant_response = ""
            try:
                with Live(Markdown(assistant_response), console=console, auto_refresh=True, refresh_per_second=12, vertical_overflow="visible") as live:
                    for chunk in stream:
                        content = chunk.choices[0].delta.content
                        if content is not None:
                            assistant_response += content
                            # Update the display with parsed markdown representation
                            live.update(Markdown(assistant_response))
            except KeyboardInterrupt:
                # Catch Ctrl+C during streaming to interrupt the AI response early
                console.print(f"\n[bold grey50](Generation interrupted)[/bold grey50]")
                
            # Append complete response to message history if something was generated
            if assistant_response:
                messages.append({"role": "assistant", "content": assistant_response})
            print() # Spacer line
            
        except KeyboardInterrupt:
            # Catch Ctrl+C at the user prompt
            if interrupted_last:
                console.print(f"\n[bold grey50]Exiting chat session. Goodbye![/bold grey50]")
                break
            else:
                console.print(f"\n[bold grey50](Press Ctrl+C again or type 'exit' to quit)[/bold grey50]")
                interrupted_last = True
                continue
        except Exception as e:
            console.print(f"\n\n[bold red]Error: {e}[/bold red]")

def single_query(client, prompt, system_prompt, temperature):
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    
    try:
        console.print(f"\n[bold cyan]AI:[/bold cyan]")
        stream = client.chat.completions.create(
            model="local-model",
            messages=messages,
            temperature=temperature,
            stream=True
        )
        
        assistant_response = ""
        with Live(Markdown(assistant_response), console=console, auto_refresh=True, refresh_per_second=12, vertical_overflow="visible") as live:
            for chunk in stream:
                content = chunk.choices[0].delta.content
                if content is not None:
                    assistant_response += content
                    live.update(Markdown(assistant_response))
        print()
    except Exception as e:
        console.print(f"\n\n[bold red]Error: {e}[/bold red]")

def main():
    parser = argparse.ArgumentParser(description="Interactive CLI tool to chat with local LM Studio server.")
    parser.add_argument("prompt", nargs="?", default=None, help="Optional. Run a single chat completion instead of starting an interactive session.")
    parser.add_argument("-s", "--system", default="You are a helpful and concise AI assistant.", help="The system prompt to use.")
    parser.add_argument("-t", "--temperature", type=float, default=0.7, help="Sampling temperature (default: 0.7).")
    
    args = parser.parse_args()
    
    client = OpenAI(
        base_url=BASE_URL,
        api_key="lm-studio"
    )
    
    if args.prompt:
        single_query(client, args.prompt, args.system, args.temperature)
    else:
        interactive_chat(client, args.system, args.temperature)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print(f"\n[bold grey50]Session terminated by user. Goodbye![/bold grey50]")
        sys.exit(0)
