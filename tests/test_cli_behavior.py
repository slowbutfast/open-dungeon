import unittest
import sys
import os
from unittest.mock import MagicMock, patch

# Ensure the root project path and game folder are in sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.append(root_dir)
game_dir = os.path.join(root_dir, "game")
if game_dir not in sys.path:
    sys.path.append(game_dir)

class TestCliBehavior(unittest.TestCase):
    def setUp(self):
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        self.save_dir = os.path.join(tests_dir, "adventures_test")
        os.makedirs(self.save_dir, exist_ok=True)
        os.environ["SAVE_DIR"] = self.save_dir

        # Mocking AdventureEngine so LM Studio backend requests are intercepted
        from game.adventure_engine import AdventureEngine
        self.engine = AdventureEngine()
        self.engine.client = MagicMock()
        self.engine.model = "mock-gemma"
        self.engine.adventure_id = "test-adv"
        self.engine.title = "Mock Quest"
        self.engine.history = []
        self.engine.summary = "A mock test run."

    def tearDown(self):
        import shutil
        if hasattr(self, "save_dir") and os.path.exists(self.save_dir):
            try:
                shutil.rmtree(self.save_dir)
            except OSError:
                pass

    def test_type_text_reproduces_print_error(self):
        """Verify that type_text executes without causing keyword argument errors."""
        from game import aidungeon_cli
        
        # Mock sys.stdout.flush to avoid side effects during typing simulation
        with patch("sys.stdout.flush") as mock_flush:
            # We want to test the actual call. It should not raise TypeError.
            # (In red state, this will raise: TypeError: Console.print() got an unexpected keyword argument 'flush')
            aidungeon_cli.type_text("Phosphor text test", delay=0.0)

    def test_make_layout_returns_valid_layout(self):
        """Verify that make_layout compiles and renders a valid layout with CRT panels."""
        from game import ui_renderer
        from rich.layout import Layout
        from rich.console import Console
        
        layout = ui_renderer.make_layout(
            engine=self.engine,
            streaming_text="Streaming some tokens...",
            system_msg="Mock System OK"
        )
        
        self.assertIsInstance(layout, Layout)
        
        # Test rendering of the layout using console capture to verify it prints properly
        test_console = Console(width=100, height=30)
        with test_console.capture() as capture:
            test_console.print(layout)
        output = capture.get()
        
        self.assertIn("TERMINAL LINK", output)
        self.assertIn("Prompts before compaction", output)
        self.assertIn("STORY MONITOR", output)
        self.assertIn("SYS CONSOLE COMMAND REFERENCE", output)

    def test_show_help_screen_runs_cleanly(self):
        """Verify that the help screen renders cleanly."""
        from game import menu_manager
        
        menu_manager.show_help_screen()

    def test_handle_summary_edit_updates_engine(self):
        """Verify that manual summary editing updates the engine and saves state."""
        from game import menu_manager
        
        with patch("game.menu_manager.get_interactive_edit", return_value="The traveler has reached the misty valley.") as mock_prompt_ask, \
             patch("rich.console.Console.clear"):
            # Set up mock save behavior
            self.engine.save = MagicMock()
            
            msg = menu_manager.handle_summary_edit(self.engine)
            
            # Assert engine state updated
            self.assertEqual(self.engine.summary, "The traveler has reached the misty valley.")
            self.engine.save.assert_called_once()
            self.assertIn("updated successfully", msg)

    def test_handle_lore_menu_toggle_card(self):
        """Verify that the lore configuration menu can toggle cards correctly."""
        from game import menu_manager
        
        # Pre-populate a card in engine
        self.engine.cards = [{
            "id": "e1",
            "name": "Eldrin",
            "type": "character",
            "description": "An elf mage.",
            "trigger_words": ["eldrin"],
            "enabled": True
        }]
        self.engine.save = MagicMock()
        
        # Mock inputs: first select option "3" (Toggle Card), then enter index "0" to toggle Eldrin,
        # then select option "5" to exit the menu loop.
        prompt_responses = ["3", "0", "5"]
        
        with patch("rich.prompt.Prompt.ask", side_effect=prompt_responses) as mock_prompt_ask, \
             patch("rich.console.Console.clear"):
             
            msg = menu_manager.handle_lore_menu(self.engine)
            
            # Verify card was toggled to enabled=False
            self.assertFalse(self.engine.cards[0]["enabled"])
            self.engine.save.assert_called()
            self.assertEqual(msg, "Lorebook modifications finalized.")

    def test_handle_lore_menu_edit_card(self):
        """Verify that the lore configuration menu allows editing cards."""
        from game import menu_manager
        
        self.engine.cards = [{
            "id": "e1",
            "name": "Eldrin",
            "type": "character",
            "description": "An elf mage.",
            "trigger_words": ["eldrin"],
            "enabled": True
        }]
        self.engine.save = MagicMock()
        
        # Mock inputs:
        # Prompt.ask choices: 1. Option "4" (Edit Card), 2. Enter index "0", 3. Type "character", 4. Option "5" (Return)
        prompt_responses = ["4", "0", "character", "5"]
        # get_interactive_edit inputs: 1. New Name, 2. New Description, 3. New Triggers
        edit_responses = ["Eldrin the Wise", "A very old elf mage.", "eldrin, wise"]
        
        with patch("rich.prompt.Prompt.ask", side_effect=prompt_responses) as mock_prompt_ask, \
             patch("game.menu_manager.get_interactive_edit", side_effect=edit_responses) as mock_edit_ask, \
             patch("rich.console.Console.clear"), \
             patch("time.sleep"):
             
            msg = menu_manager.handle_lore_menu(self.engine)
            
            # Verify card was updated
            card = self.engine.cards[0]
            self.assertEqual(card["name"], "Eldrin the Wise")
            self.assertEqual(card["description"], "A very old elf mage.")
            self.assertEqual(card["trigger_words"], ["eldrin", "wise"])
            self.engine.save.assert_called()
            self.assertEqual(msg, "Lorebook modifications finalized.")

    def test_handle_load_menu_loads_save_slot(self):
        """Verify that selecting a save slot in the load menu invokes engine load."""
        from game import menu_manager
        
        # Mock available slot
        mock_saves = [{
            "id": "abc12",
            "title": "Old Quest",
            "turns": 5,
            "summary": "Adventure progress log."
        }]
        self.engine.list_adventures = MagicMock(return_value=mock_saves)
        self.engine.load = MagicMock()
        
        # Mock inputs: select option "1" (Load Adventure), then select index "0"
        with patch("rich.prompt.Prompt.ask", side_effect=["1", "0"]) as mock_prompt_ask, \
             patch("rich.console.Console.clear"):
            
            msg = menu_manager.handle_load_menu(self.engine)
            
            # Verify load called
            self.engine.load.assert_called_once_with("abc12")
            self.assertIn("Loaded adventure", msg)

    def test_handle_load_menu_deletes_save_slot(self):
        """Verify that selecting delete adventure in the load menu prompts for confirmation and calls delete."""
        from game import menu_manager
        
        # Mock available slot
        mock_saves = [{
            "id": "abc12",
            "title": "Old Quest",
            "turns": 5,
            "summary": "Adventure progress log."
        }]
        self.engine.list_adventures = MagicMock(return_value=mock_saves)
        self.engine.delete_adventure = MagicMock(return_value=True)
        
        # Mock inputs:
        # 1. Option "2" (Delete Adventure)
        # 2. Slot index "0"
        # 3. Option "3" (Return) to exit the loop
        prompt_responses = ["2", "0", "3"]
        
        with patch("rich.prompt.Prompt.ask", side_effect=prompt_responses) as mock_prompt_ask, \
             patch("rich.prompt.Confirm.ask", return_value=True) as mock_confirm_ask, \
             patch("mock_sleep") if False else patch("time.sleep") as mock_sleep, \
             patch("rich.console.Console.clear"):
            
            msg = menu_manager.handle_load_menu(self.engine)
            
            # Verify delete_adventure called with the selected id
            self.engine.delete_adventure.assert_called_once_with("abc12")
            mock_confirm_ask.assert_called_once()
            # Should have returned None because we exited with choice 3
            self.assertIsNone(msg)

    def test_limit_story_height_scrolls_to_bottom(self):
        """Verify that limit_story_height trims older lines and shows scroll notice."""
        from game import ui_renderer
        
        # Build a long story content with 40 newlines
        long_story = "\n".join([f"Line number {i}" for i in range(40)])
        
        # Test trimming on a simulated 20-row terminal height
        trimmed = ui_renderer.limit_story_height(long_story, console_width=80, console_height=20)
        
        # Verify it was trimmed and contains the scroll indicator
        self.assertIn("AUTO-SCROLLED", trimmed)
        self.assertNotIn("Line number 0", trimmed)
        self.assertIn("Line number 39", trimmed)

    def test_setup_new_adventure_presets(self):
        """Verify that starting a new preset adventure correctly sets up engine data."""
        from game import menu_manager
        
        # Setup mocks
        self.engine.new_adventure = MagicMock()
        self.engine.save = MagicMock()
        self.engine.add_manual_card = MagicMock()
        
        mock_stream = [
            {"type": "status", "content": "Generating..."},
            {"type": "chunk", "content": "You wake up in the Shire..."},
            {"type": "done", "content": "You wake up in the Shire..."}
        ]
        self.engine.generate_response_stream = MagicMock(return_value=mock_stream)
        
        # Mock inputs:
        # 1. Preset choice: "1" (Lord of the Rings preset)
        # 2. Character choice: "2" (Elandra - Elf Ranger)
        # 3. Proceed choice: "1" (Proceed with this adventure)
        prompt_choices = ["1", "2", "1"]
        
        with patch("rich.prompt.Prompt.ask", side_effect=prompt_choices) as mock_prompt_ask, \
             patch("rich.prompt.Confirm.ask", return_value=False) as mock_confirm_ask, \
             patch("rich.console.Console.clear") as mock_clear:
             
            menu_manager.setup_new_adventure(self.engine)
            
            # Verify mock calls
            self.engine.new_adventure.assert_called_once()
            self.engine.add_manual_card.assert_called_once_with(
                "Elandra",
                "Elf Ranger",
                "A silent elf ranger wearing a green cloak, wielding a longbow, and skilled in tracking.",
                ["elandra", "ranger", "longbow"]
            )
            # Verify summary set
            self.assertIn("Ring of Power", self.engine.summary)

    def test_setup_new_adventure_custom_prompt(self):
        """Verify that selecting custom prompt editing updates the system prompt."""
        from game import menu_manager
        
        # Setup mocks
        self.engine.new_adventure = MagicMock()
        self.engine.save = MagicMock()
        self.engine.add_manual_card = MagicMock()
        
        mock_stream = [
            {"type": "status", "content": "Generating..."},
            {"type": "chunk", "content": "Custom scene..."},
            {"type": "done", "content": "Custom scene..."}
        ]
        self.engine.generate_response_stream = MagicMock(return_value=mock_stream)
        
        # Mock inputs:
        # Prompt.ask choices: 1. Preset choice "3", 2. Character choice "1", 3. Proceed choice "1"
        prompt_choices = ["3", "1", "1"]
        # get_interactive_edit choices: 1. Custom prompt input
        edit_choices = ["Custom Jedi DM rules."]
        
        # Confirm.ask:
        # - Customize story universe: False
        # - Customize system prompt: True
        # - Customize character details: False
        confirm_responses = [False, True, False]
        
        with patch("rich.prompt.Prompt.ask", side_effect=prompt_choices) as mock_prompt_ask, \
             patch("game.menu_manager.get_interactive_edit", side_effect=edit_choices) as mock_edit_ask, \
             patch("rich.prompt.Confirm.ask", side_effect=confirm_responses) as mock_confirm_ask:
              
            menu_manager.setup_new_adventure(self.engine)
            
            # Verify custom system prompt was used during new_adventure initialization
            self.engine.new_adventure.assert_called_once_with("Star Wars: The Outer Rim", "Custom Jedi DM rules.")

    def test_limit_story_height_with_scroll_state(self):
        """Verify that limit_story_height populates scroll_state and clamps offset."""
        from game import ui_renderer
        
        long_story = "\n".join([f"Story Turn {i}" for i in range(50)])
        scroll_state = {"offset": 0, "max_scroll": 0}
        
        # Test with scroll_offset = 0
        trimmed = ui_renderer.limit_story_height(long_story, console_width=80, console_height=20, scroll_offset=0, scroll_state=scroll_state)
        self.assertIn("AUTO-SCROLLED", trimmed)
        self.assertEqual(scroll_state["offset"], 0)
        self.assertGreater(scroll_state["max_scroll"], 0)
        
        # Test with positive scroll_offset
        scroll_state_up = {"offset": 0, "max_scroll": 0}
        trimmed_up = ui_renderer.limit_story_height(long_story, console_width=80, console_height=20, scroll_offset=5, scroll_state=scroll_state_up)
        self.assertIn("SCROLLED UP", trimmed_up)
        self.assertEqual(scroll_state_up["offset"], 5)
        
        # Test scroll_offset clamping
        scroll_state_clamped = {"offset": 0, "max_scroll": 0}
        trimmed_clamped = ui_renderer.limit_story_height(long_story, console_width=80, console_height=20, scroll_offset=9999, scroll_state=scroll_state_clamped)
        self.assertEqual(scroll_state_clamped["offset"], scroll_state_clamped["max_scroll"])
        self.assertIn("SCROLLED UP", trimmed_clamped)

    def test_markdown_to_rich(self):
        """Verify that markdown_to_rich translates bold, italic, headings, and lists correctly."""
        from game import ui_renderer
        
        text = "### Heading\n**bold** and *italic*\n- list item"
        rich_formatted = ui_renderer.markdown_to_rich(text)
        
        self.assertIn("[bold green]■ Heading ■[/bold green]", rich_formatted)
        self.assertIn("[bold]bold[/bold]", rich_formatted)
        self.assertIn("[italic]italic[/italic]", rich_formatted)
        self.assertIn("• list item", rich_formatted)

    def test_get_interactive_input_simulation(self):
        """Simulate keystroke sequence including typing, backspacing, scrolling, history cycling, and Enter."""
        from game import input_handler
        
        # We need a mock engine and a mock scroll_state
        mock_engine = MagicMock()
        mock_engine.history = []
        mock_engine.summary = ""
        scroll_state = {"offset": 0, "max_scroll": 10}
        command_history = ["first command", "second command"]
        
        # Keystroke sequence to mock read_key:
        # 1. 'h'
        # 2. 'i'
        # 3. Backspace ('\x7f')
        # 4. Left Arrow ('\x1b[D') -> previous command ("second command")
        # 5. Left Arrow ('\x1b[D') -> first command ("first command")
        # 6. Up Arrow ('\x1b[A') -> scroll up
        # 7. Enter ('\n') -> submit
        input_sequence = ["h", "i", "\x7f", "\x1b[D", "\x1b[D", "\x1b[A", "\n"]
        
        with patch("game.input_handler.read_key", side_effect=input_sequence) as mock_read_key:
             
            result = input_handler.get_interactive_input(
                mock_engine, 
                scroll_state, 
                command_history=command_history
            )
            
            # The final result should be the first command from history since we pressed Left Arrow twice and then hit Enter!
            self.assertEqual(result, "first command")
            
            # The scroll offset should have incremented by 3 because we pressed Up Arrow once!
            self.assertEqual(scroll_state["offset"], 3)

    def test_read_key_non_tty_fallback(self):
        """Verify that read_key behaves correctly when stdin is not a TTY."""
        from game import input_handler
        
        with patch("sys.stdin.read", return_value="x") as mock_read, \
             patch("os.isatty", return_value=False) as mock_isatty:
            key = input_handler.read_key()
            self.assertEqual(key, "x")
            mock_read.assert_called_once_with(1)

    def test_setup_new_adventure_back_out_preset(self):
        """Verify that selecting option 5 (Return to Start Menu) during preset selection returns False."""
        from game import menu_manager
        
        with patch("rich.prompt.Prompt.ask", return_value="5") as mock_prompt_ask, \
             patch("rich.console.Console.clear"):
            
            result = menu_manager.setup_new_adventure(self.engine)
            self.assertFalse(result)
            mock_prompt_ask.assert_called_once()

    def test_setup_new_adventure_back_out_character(self):
        """Verify that selecting option 5 (Return to Start Menu) during character selection returns False."""
        from game import menu_manager
        
        # Select Lord of the Rings preset (1), don't customize prompt (False), and then select Return to Start Menu (5)
        prompt_choices = ["1", "5"]
        
        with patch("rich.prompt.Prompt.ask", side_effect=prompt_choices) as mock_prompt_ask, \
             patch("rich.prompt.Confirm.ask", return_value=False) as mock_confirm_ask, \
             patch("rich.console.Console.clear"):
            
            result = menu_manager.setup_new_adventure(self.engine)
            self.assertFalse(result)
            self.assertEqual(mock_prompt_ask.call_count, 2)

    def test_generate_suggestions_success(self):
        """Verify that suggestions are correctly requested and parsed from LLM response."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "1. Climb the wall\n2. Talk to the wizard\n3. Cast a spell"
        self.engine.client.chat.completions.create = MagicMock(return_value=mock_response)
        
        suggestions = self.engine.generate_suggestions()
        
        self.assertEqual(suggestions, ["Climb the wall", "Talk to the wizard", "Cast a spell"])
        self.engine.client.chat.completions.create.assert_called_once()

    def test_get_interactive_input_select_suggestion(self):
        """Verify that selecting option 1-3 from suggestions menu returns the corresponding suggestion."""
        from game import input_handler
        
        self.engine.suggestions = ["Climb the wall", "Talk to the wizard", "Cast a spell"]
        scroll_state = {"offset": 0}
        
        # Keystrokes sequence: select '2' and Enter
        input_sequence = ["2", "\n"]
        
        with patch("game.input_handler.read_key", side_effect=input_sequence) as mock_read_key:
             
            result = input_handler.get_interactive_input(
                self.engine,
                scroll_state,
                command_history=[]
            )
            
            # The result should be the 2nd suggestion
            self.assertEqual(result, "Talk to the wizard")
            # engine.suggestions should be cleared to empty list
            self.assertEqual(self.engine.suggestions, [])
 
    def test_get_interactive_input_select_custom_action(self):
        """Verify that typing a custom action directly returns it and clears suggestions on action submission."""
        from game import input_handler
        
        self.engine.suggestions = ["Climb the wall", "Talk to the wizard", "Cast a spell"]
        scroll_state = {"offset": 0}
        
        # Keystrokes sequence:
        # Type "hello" and Enter
        input_sequence = ["h", "e", "l", "l", "o", "\n"]
        
        with patch("game.input_handler.read_key", side_effect=input_sequence) as mock_read_key:
             
            result = input_handler.get_interactive_input(
                self.engine,
                scroll_state,
                command_history=[]
            )
            
            self.assertEqual(result, "hello")
            # engine.suggestions should be cleared since "hello" is a standard action submission
            self.assertEqual(self.engine.suggestions, [])

    def test_dynamic_response_length_simple_action(self):
        """Verify that simple physical actions reduce max_tokens via proportional floor (max(60, max_tokens//3)) and append brevity instructions."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].delta.content = "Opening the small mailbox reveals a leaflet. [Status: West of House | Score: 0]"
        
        self.engine.client.chat.completions.create = MagicMock(return_value=[mock_response])
        
        list(self.engine.generate_response_stream("do", "open mailbox"))
        
        self.engine.client.chat.completions.create.assert_called_once()
        kwargs = self.engine.client.chat.completions.create.call_args[1]
        
        # Default max_tokens=300 → proportional floor = max(60, 300//3) = 100
        expected = max(60, self.engine.max_tokens // 3)
        self.assertEqual(kwargs["max_tokens"], expected)
        system_content = kwargs["messages"][0]["content"]
        self.assertIn("(Reply with a single curt sentence of 15 words or less.)", system_content)

    def test_dynamic_response_length_complex_action(self):
        """Verify that complex actions keep max_tokens at default (300) and do not inject the curt sentence rule."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].delta.content = "A complex description. [Status: West of House | Score: 0]"
        
        self.engine.client.chat.completions.create = MagicMock(return_value=[mock_response])
        
        list(self.engine.generate_response_stream("do", "walk slowly into the dark and mysterious forest"))
        
        self.engine.client.chat.completions.create.assert_called_once()
        kwargs = self.engine.client.chat.completions.create.call_args[1]
        
        self.assertEqual(kwargs["max_tokens"], 300)
        system_content = kwargs["messages"][0]["content"]
        self.assertNotIn("(Reply with a single curt sentence of 15 words or less.)", system_content)

    @patch("game.aidungeon_cli.run_game_turn")
    @patch("game.aidungeon_cli.get_interactive_input")
    @patch("game.aidungeon_cli.init_terminal")
    @patch("game.aidungeon_cli.draw_status_bar")
    @patch("game.aidungeon_cli.reset_terminal")
    def test_empty_input_triggers_continue_turn(self, mock_reset, mock_draw, mock_init, mock_input, mock_run_turn):
        """Verify that pressing Enter on blank input triggers a '/continue' game turn."""
        from game import aidungeon_cli
        
        mock_input.side_effect = ["", "/quit"]
        
        mock_engine = MagicMock()
        mock_engine.history = []
        mock_engine.client = MagicMock()
        
        with patch("rich.prompt.Prompt.ask", return_value="1"), \
             patch("game.aidungeon_cli.setup_new_adventure", return_value=True), \
             patch("argparse.ArgumentParser.parse_args", return_value=MagicMock(load=None)), \
             patch("sys.exit") as mock_exit:
             
            mock_exit.side_effect = SystemExit
            with patch("game.aidungeon_cli.AdventureEngine", return_value=mock_engine):
                try:
                    aidungeon_cli.main()
                except SystemExit:
                    pass
                
            mock_run_turn.assert_called_with(mock_engine, "continue", "")

    @patch("game.aidungeon_cli.run_game_turn")
    @patch("game.aidungeon_cli.get_interactive_input")
    @patch("game.aidungeon_cli.read_key_nonblocking")
    @patch("game.aidungeon_cli.init_terminal")
    @patch("game.aidungeon_cli.draw_status_bar")
    @patch("game.aidungeon_cli.reset_terminal")
    @patch("time.sleep")
    def test_autoplay_runs_and_pauses_on_keypress(self, mock_sleep, mock_reset, mock_draw, mock_init, mock_read_key, mock_input, mock_run_turn):
        """Verify that /auto autoplay runs continue turns and pauses when a key is pressed."""
        from game import aidungeon_cli
        
        mock_input.side_effect = ["/auto", "/quit"]
        mock_read_key.side_effect = [None] * 14 + ["p"]
        
        mock_engine = MagicMock()
        mock_engine.history = []
        
        with patch("rich.prompt.Prompt.ask", return_value="1"), \
             patch("game.aidungeon_cli.setup_new_adventure", return_value=True), \
             patch("argparse.ArgumentParser.parse_args", return_value=MagicMock(load=None)), \
             patch("sys.exit") as mock_exit:
             
            mock_exit.side_effect = SystemExit
            with patch("game.aidungeon_cli.AdventureEngine", return_value=mock_engine):
                try:
                    aidungeon_cli.main()
                except SystemExit:
                    pass
                
            mock_run_turn.assert_any_call(mock_engine, "continue", "")
            self.assertGreater(mock_read_key.call_count, 0)

    @patch("builtins.input", return_value="Dungeon Master Edited")
    def test_get_interactive_edit(self, mock_input):
        """Verify that get_interactive_edit sets readline startup hook, calls input(), and returns the value."""
        from game import input_handler
        
        with patch("os.isatty", return_value=True), \
             patch("game.input_handler.readline") as mock_readline:
             
            result = input_handler.get_interactive_edit("> ", "Dungeon Master")
            self.assertEqual(result, "Dungeon Master Edited")
            
            # Verify startup hook registration
            mock_readline.set_startup_hook.assert_called()
            hook_func = mock_readline.set_startup_hook.call_args_list[0][0][0]
            hook_func()
            mock_readline.insert_text.assert_called_with("Dungeon Master")
            
            # Verify cleanup
            mock_readline.set_startup_hook.assert_any_call(None)



