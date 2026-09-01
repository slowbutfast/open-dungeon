import sys
import os
import shutil
import unittest
import io
import re
import pytest
from unittest.mock import MagicMock, patch
from tests.test_helpers import assert_save_dir_is_safe

pytestmark = pytest.mark.integration

# Add game directory to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "game"))

class PlaytestSimulator(unittest.TestCase):
    def setUp(self):
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        self.save_dir = os.path.join(tests_dir, "adventures_sim_test")
        os.makedirs(self.save_dir, exist_ok=True)
        os.environ["SAVE_DIR"] = self.save_dir

    def tearDown(self):
        if hasattr(self, "save_dir") and os.path.exists(self.save_dir):
            assert_save_dir_is_safe(self.save_dir)
            shutil.rmtree(self.save_dir, ignore_errors=True)

    def test_complete_gameplay_simulation(self):
        """Simulates a full interactive session covering menus, backouts, editing, history recall, and scroll boundaries."""
        print("\n=======================================================")
        print("          STARTING AUTOMATED PLAYTEST SIMULATOR        ")
        print("=======================================================\n")
        
        # 1. Setup mock engine completions stream
        mock_opening_stream = [
            {"type": "chunk", "content": "You stand on the desert sands of Tatooine.\n[Status: Tatooine | Score: 0]"}
        ]
        mock_turn1_stream = [
            {"type": "chunk", "content": "You walk south into the noisy cantina.\n[Status: Cantina | Score: 5]"}
        ]
        mock_turn2_stream = [
            {"type": "chunk", "content": "You are already in the cantina.\n[Status: Cantina | Score: 5]"}
        ]
        
        # We mock completions creation
        mock_completions = MagicMock()
        
        # 2. Mock Prompt/Confirm side effects
        prompt_responses = [
            # Startup menu -> Load save -> Cancel back
            "2", "3",
            # Startup menu -> New LOTR preset -> Cancel character select back
            "1", "1", "5",
            # Startup menu -> Begin real Star Wars game
            "1", "3", "4", "1",
            # In gameplay `/lore` edit flow:
            "4", "0", "character", "5"
        ]
        
        edit_responses = [
            # Star Wars custom system prompt
            "Custom Force rules.",
            # Custom character details
            "Korr", "Smuggler", "A quick blaster smuggler.", "korr, smuggler",
            # In gameplay `/summary` call
            "Korr entered the cantina.",
            # In gameplay `/lore` edit flow
            "Korr the Bold", "A legendary smuggler.", "korr, bold"
        ]
        
        edit_iter = iter(edit_responses)
        def shared_edit_mock(*args, **kwargs):
            return next(edit_iter)
            
        confirm_responses = [
            # LOTR Preset customizations (False, False)
            False, False,
            # Star Wars preset customize details (False)
            False,
            # Star Wars custom system prompt (True)
            True,
            # Custom character edit (False)
            False
        ]
        
        # Flat read_key sequence simulating raw keyboard typing & editing in gameplay loops
        read_key_sequence = (
            # Turn 1: User types "go southh", backspaces extra character, hits enter
            ["g", "o", " ", "s", "o", "u", "t", "h", "h", "\x7f", "\n"] +
            # Turn 2: User hits Left Arrow (history cycles back to "go south"), hits enter
            ["\x1b[D", "\n"] +
            # Turn 3: User types "/help", hits enter
            ["/", "h", "e", "l", "p", "\n"] +
            # Turn 4: User types "/summary"
            ["/", "s", "u", "m", "m", "a", "r", "y", "\n"] +
            # Turn 5: User types "/lore"
            ["/", "l", "o", "r", "e", "\n"] +
            # Turn 6: User types "/save"
            ["/", "s", "a", "v", "e", "\n"] +
            # Turn 7: User types "/quit" to exit cleanly
            ["/", "q", "u", "i", "t", "\n"]
        )
        
        # Capture stdout to verify Zork console prints
        captured_stdout = io.StringIO()
        old_stdout = sys.stdout
        sys.stdout = captured_stdout
        
        try:
            # We import game modules inside the test to assert correctly
            from adventure_engine import AdventureEngine
            import aidungeon_cli
            
            # Patch AdventureEngine.client.chat.completions.create to avoid making network requests
            with patch.object(AdventureEngine, "save", MagicMock()), \
                 patch.object(AdventureEngine, "load", MagicMock()), \
                 patch.object(AdventureEngine, "list_adventures", return_value=[{"id": "abc12", "title": "Old Quest", "turns": 5, "summary": "Adventure progress log.", "location": "West of House", "score": 0, "moves": 0}]), \
                 patch("rich.prompt.Prompt.ask", side_effect=prompt_responses) as mock_prompt_ask, \
                 patch("menu_manager.get_interactive_edit", side_effect=shared_edit_mock) as mock_menu_edit_ask, \
                 patch("aidungeon_cli.get_interactive_edit", side_effect=shared_edit_mock) as mock_cli_edit_ask, \
                 patch("rich.prompt.Confirm.ask", side_effect=confirm_responses) as mock_confirm_ask, \
                 patch("input_handler.read_key", side_effect=read_key_sequence) as mock_read_key, \
                 patch("time.sleep", MagicMock()):
                 
                # Set up response stream mocks in order of turn execution
                engine_instance = AdventureEngine()
                
                # Intercept completions stream creator
                mock_completions.create.side_effect = [
                    # 1. Opening scene
                    [MagicMock(choices=[MagicMock(delta=MagicMock(content=chunk["content"]))]) for chunk in mock_opening_stream],
                    # 2. Turn 1 (go south)
                    [MagicMock(choices=[MagicMock(delta=MagicMock(content=chunk["content"]))]) for chunk in mock_turn1_stream],
                    # 3. Turn 2 (go south history cycle)
                    [MagicMock(choices=[MagicMock(delta=MagicMock(content=chunk["content"]))]) for chunk in mock_turn2_stream]
                ]
                engine_instance.client.chat = MagicMock(completions=mock_completions)
                
                # Patch AdventureEngine constructor inside aidungeon_cli.main to return our pre-configured mock engine
                with patch("aidungeon_cli.AdventureEngine", return_value=engine_instance):
                    # Run the game orchestrator!
                    aidungeon_cli.main()
                    
        except SystemExit:
            # Game exit via sys.exit(0) is expected
            pass
        finally:
            sys.stdout = old_stdout
            
        output_str = captured_stdout.getvalue()
        
        # 3. Run assertions on captured terminal output
        
        # Verify Zork-style banner and copyright is printed
        self.assertIn("OpenDungeon — in the tradition of Infocom, Inc., 1981-1983.", output_str)
        self.assertIn("Revision 88 / Connection online.", output_str)
        
        # Verify backing out load save works
        self.assertIn("AVAILABLE SAVED ADVENTURES", output_str)
        
        # Verify preset menu is displayed
        self.assertIn("STORY GENESIS PRESETS", output_str)
        
        # Verify character genesis selector is displayed
        self.assertIn("CHARACTER GENESIS", output_str)
        
        # Verify narrative text was successfully printed
        self.assertIn("You stand on the desert sands of Tatooine.", output_str)
        self.assertIn("You walk south into the noisy cantina.", output_str)
        self.assertIn("You are already in the cantina.", output_str)
        
        # CRITICAL ASSERTION:
        # Verify the raw status metadata line is NEVER printed directly to screen
        self.assertNotIn("[Status: Tatooine | Score: 0]", output_str)
        self.assertNotIn("[Status: Cantina | Score: 5]", output_str)
        
        # Verify state values are correctly updated
        self.assertEqual(engine_instance.location, "Cantina")
        self.assertEqual(engine_instance.score, 5)
        self.assertEqual(engine_instance.moves, 3)  # Opening + Turn 1 + Turn 2
        
        # Verify help handbook is printed inline
        self.assertIn("TERMINAL HANDBOOK", output_str)
        self.assertIn("/undo", output_str)
        
        # Verify summary editing updates state
        self.assertEqual(engine_instance.summary, "Korr entered the cantina.")
        
        # Verify lore cards toggle/edit menu updates state
        self.assertEqual(engine_instance.cards[0]["name"], "Korr the Bold")
        self.assertEqual(engine_instance.cards[0]["description"], "A legendary smuggler.")
        self.assertEqual(engine_instance.cards[0]["trigger_words"], ["korr", "bold"])
        
        # Print results report
        print(output_str)
        print("=======================================================")
        print("          PLAYTEST SIMULATION PASSED SUCCESSFULLY       ")
        print("=======================================================")

if __name__ == "__main__":
    unittest.main()
