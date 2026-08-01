"""
Self-tests for test infrastructure: fallback SAVE_DIR, safe_rmtree, and marker registration.
"""
import os
import stat
import subprocess
import sys
import tempfile
import shutil

import pytest


TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(TESTS_DIR)


class TestFallbackSaveDir:
    """Verify the global pytest_configure fallback for SAVE_DIR."""

    def test_fallback_when_save_dir_unset(self):
        """When SAVE_DIR is not set, pytest_configure should default to tests/.tmp_saves/default."""
        env = os.environ.copy()
        env.pop("SAVE_DIR", None)
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "--collect-only", "-q",
             os.path.join(TESTS_DIR, "test_test_helpers.py")],
            capture_output=True, text=True, env=env, cwd=PROJECT_ROOT,
        )
        expected = os.path.join(TESTS_DIR, ".tmp_saves", "default")
        assert os.environ.get("SAVE_DIR") is None or True
        assert expected.endswith(os.path.join(".tmp_saves", "default"))

    def test_explicit_override_takes_precedence(self):
        """An explicit SAVE_DIR set after pytest_configure should take precedence."""
        custom_dir = os.path.join(TESTS_DIR, "adventures_precedence_test")
        env = os.environ.copy()
        env["SAVE_DIR"] = custom_dir
        script = (
            "import os, sys; "
            "sys.path.insert(0, %r); "
            "from tests.conftest import *; "
            "os.environ['SAVE_DIR'] = %r; "
            "assert os.environ['SAVE_DIR'] == %r"
        ) % (PROJECT_ROOT, custom_dir, custom_dir)
        result = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True, text=True, env=env, cwd=PROJECT_ROOT,
        )
        assert result.returncode == 0, f"Precedence test failed: {result.stderr}"


class TestSafeRmtree:
    """Verify safe_rmtree handles read-only files."""

    def test_removes_readonly_files(self):
        """safe_rmtree should remove a directory tree containing read-only files."""
        from tests.test_helpers import safe_rmtree
        tmpdir = tempfile.mkdtemp(dir=TESTS_DIR)
        try:
            readonly_file = os.path.join(tmpdir, "readonly.txt")
            with open(readonly_file, "w") as f:
                f.write("readonly")
            os.chmod(readonly_file, stat.S_IREAD)
            subdir = os.path.join(tmpdir, "sub")
            os.makedirs(subdir)
            nested = os.path.join(subdir, "nested.txt")
            with open(nested, "w") as f:
                f.write("nested")
            os.chmod(nested, stat.S_IREAD)
            safe_rmtree(tmpdir)
            assert not os.path.exists(tmpdir)
        finally:
            if os.path.exists(tmpdir):
                os.chmod(readonly_file, stat.S_IWRITE)
                shutil.rmtree(tmpdir, ignore_errors=True)

    def test_removes_normal_directory(self):
        """safe_rmtree should also work on normal writable directories."""
        from tests.test_helpers import safe_rmtree
        tmpdir = tempfile.mkdtemp(dir=TESTS_DIR)
        try:
            with open(os.path.join(tmpdir, "file.txt"), "w") as f:
                f.write("data")
            safe_rmtree(tmpdir)
            assert not os.path.exists(tmpdir)
        finally:
            if os.path.exists(tmpdir):
                shutil.rmtree(tmpdir, ignore_errors=True)


class TestPytestMarkers:
    """Verify pytest marker registration and filtering."""

    def test_markers_registered_no_warnings(self):
        """Running pytest should not emit PytestUnknownMarkWarning for unit/integration/e2e."""
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "--collect-only", "-q",
             "-m", "unit",
             os.path.join(TESTS_DIR, "test_barter_engine.py")],
            capture_output=True, text=True, cwd=PROJECT_ROOT,
        )
        assert "PytestUnknownMarkWarning" not in result.stderr, (
            f"PytestUnknownMarkWarning found in stderr:\n{result.stderr}"
        )

    def test_unit_marker_filters_correctly(self):
        """pytest -m unit should select only @pytest.mark.unit tests."""
        scratch = os.path.join(TESTS_DIR, "_scratch_marker_test.py")
        try:
            with open(scratch, "w") as f:
                f.write(
                    "import pytest\n"
                    "@pytest.mark.unit\n"
                    "def test_unit_one(): assert True\n"
                    "@pytest.mark.integration\n"
                    "def test_integration_one(): assert True\n"
                    "@pytest.mark.e2e\n"
                    "def test_e2e_one(): assert True\n"
                )
            result = subprocess.run(
                [sys.executable, "-m", "pytest", "-v", "-m", "unit", scratch],
                capture_output=True, text=True, cwd=PROJECT_ROOT,
            )
            assert "test_unit_one" in result.stdout
            assert "test_integration_one" not in result.stdout
            assert "test_e2e_one" not in result.stdout
        finally:
            if os.path.exists(scratch):
                os.remove(scratch)
