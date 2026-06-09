#!/bin/bash

# Resolve the absolute directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo ">> Initiating Retro Terminal Interconnect..."

# Store the original font size of the Homebrew profile
ORIG_SIZE=$(osascript -e 'tell application "Terminal" to get font size of settings set "Homebrew"')

# Temporarily scale the font size to 20 to emulate a retro 2x CRT layout
osascript -e 'tell application "Terminal" to set font size of settings set "Homebrew" to 20'

echo ">> Launching game CLI in a new Terminal window..."

# Execute AppleScript to open a new Terminal window, run the game, restore font size on exit, and close window
osascript -e "tell application \"Terminal\"
    activate
    set targetTab to do script \"cd '$DIR' && source ../venv/bin/activate && python3 aidungeon_cli.py; osascript -e 'tell application \\\"Terminal\\\" to set font size of settings set \\\"Homebrew\\\" to $ORIG_SIZE'; osascript -e 'tell application \\\"Terminal\\\" to close front window'\"
    set current settings of targetTab to settings set \"Homebrew\"
    set background color of targetTab to {0, 0, 0}
    set number of rows of window 1 to 38
    set number of columns of window 1 to 95
end tell"

echo ">> Interconnect spawned. Good luck on your adventure."
