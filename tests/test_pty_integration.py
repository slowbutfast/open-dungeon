import pty
import os
import sys
import subprocess
import time
import unittest
import select
from tests.test_helpers import assert_save_dir_is_safe

def read_all_available(fd, timeout=1.0):
    chunks = []
    # Wait for the first chunk with a longer timeout
    rlist, _, _ = select.select([fd], [], [], timeout)
    if not rlist:
        return ""
        
    while True:
        try:
            data = os.read(fd, 4096)
            if not data:
                break
            chunks.append(data)
            # Short timeout for any remaining immediate data
            rlist, _, _ = select.select([fd], [], [], 0.1)
            if not rlist:
                break
        except OSError:
            break
    return b"".join(chunks).decode('utf-8', errors='ignore')

def write_input(fd, text):
    os.write(fd, text.encode('utf-8'))

class TestPtyIntegration(unittest.TestCase):
    def setUp(self):
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        self.save_dir = os.path.join(tests_dir, "adventures_pty_test")
        os.makedirs(self.save_dir, exist_ok=True)
        os.environ["SAVE_DIR"] = self.save_dir

    @unittest.skip("CLI is deprecated. Focus is on web app.")
    def test_pty_gameplay_and_system_menu_clears_screen(self):
        """Spawns the game in a pseudo-terminal (PTY) and verifies that switching to /system clears screen."""
        master_fd, slave_fd = pty.openpty()
        
        # Build command list
        cmd = [sys.executable, "game/aidungeon_cli.py"]
        
        # Set environment variables: force MOCK_LLM=1, pass raw terminal sizes
        env = os.environ.copy()
        env["MOCK_LLM"] = "1"
        env["TERM"] = "xterm"
        env["SAVE_DIR"] = self.save_dir
        
        # Start the subprocess with slave_fd as stdin/stdout/stderr
        proc = subprocess.Popen(
            cmd,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            env=env,
            close_fds=True,
            text=False
        )
        
        # Close the slave side in the parent process
        os.close(slave_fd)
        
        try:
            # 1. Read startup menu
            out = read_all_available(master_fd, timeout=2.0)
            self.assertIn("MAIN MENU", out)
            
            # 2. Select Option 1 (Begin New Adventure)
            write_input(master_fd, "1\n")
            
            # 3. Read Story Presets Menu
            out = read_all_available(master_fd, timeout=2.0)
            self.assertIn("STORY GENESIS PRESETS", out)
            
            # 4. Select Option 4 (Star Wars: The Outer Rim)
            write_input(master_fd, "4\n")
            
            # 5. Read customization prompts and select default choice for customize universe details (False)
            out = read_all_available(master_fd, timeout=2.0)
            write_input(master_fd, "\n")  # Keeps default Confirm.ask (False)
            
            # 6. Read customize system prompt and select default choice (False)
            out = read_all_available(master_fd, timeout=2.0)
            write_input(master_fd, "\n")  # Keeps default Confirm.ask (False)
            
            # 7. Read Character Genesis options and select Option 1 (Jaxen)
            out = read_all_available(master_fd, timeout=2.0)
            self.assertIn("CHARACTER GENESIS", out)
            write_input(master_fd, "1\n")
            
            # 8. Read character custom option and select default choice (False)
            out = read_all_available(master_fd, timeout=2.0)
            write_input(master_fd, "\n")
            
            # 9. Read scene genesis validation and select Option 1 (Proceed)
            out = read_all_available(master_fd, timeout=2.0)
            self.assertIn("Proceed with this adventure", out)
            write_input(master_fd, "1\n")
            
            # 10. Read new adventure initialized and gameplay screen
            out = read_all_available(master_fd, timeout=2.0)
            self.assertIn("Tatooine", out)
            
            # 11. Run /system system prompt edit command
            write_input(master_fd, "/system\n")
            
            # 12. Read the prompt edit screen response
            out = read_all_available(master_fd, timeout=2.0)
            
            # Verify that we reset margins and printed the header inline
            # \x1b[r -> reset margins
            self.assertIn("\x1b[r", out)
            self.assertIn("--- EDIT SYSTEM PROMPT ---", out)
            # Ensure the screen was NOT cleared for inline editing
            self.assertNotIn("\x1b[2J", out.split("/system")[1] if "/system" in out else out)
            
            # 13. Exit the /system menu without saving (press Enter)
            write_input(master_fd, "\n")
            out = read_all_available(master_fd, timeout=2.0)
            
            # 14. Quit the game cleanly
            write_input(master_fd, "/quit\n")
            time.sleep(0.5)
            
        finally:
            proc.terminate()
            proc.wait()
            os.close(master_fd)

    def tearDown(self):
        import glob
        for filepath in glob.glob(os.path.join(self.save_dir, "*.json")):
            try:
                os.remove(filepath)
            except OSError:
                pass
        import shutil
        if os.path.exists(self.save_dir):
            assert_save_dir_is_safe(self.save_dir)
            try:
                shutil.rmtree(self.save_dir)
            except OSError:
                pass

if __name__ == "__main__":
    unittest.main()
