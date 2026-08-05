"""
Test helper utilities to prevent accidental cleanup of production save directories.

This module provides shared assertion functions used across test files to
verify that save directories are scoped under the tests/ directory before
any cleanup operations occur.
"""

import os
import shutil
import stat


def assert_save_dir_is_safe(save_dir, allow_playtest=False):
    """Assert that save_dir is under the tests/ directory.

    This guard prevents accidental cleanup of production save directories
    (e.g., game/adventures/) by failing loudly if a teardown hook targets
    a path outside the test sandbox.

    The tests/ root is derived from the location of this helper module,
    which lives at ``tests/test_helpers.py``.

    Args:
        save_dir: The directory path to validate (may be relative or absolute).

    Raises:
        AssertionError: If save_dir does not start with the tests/ directory.
    """
    # Derive the project tests/ directory from this helper's location
    tests_root = os.path.dirname(os.path.abspath(__file__))
    abs_save_dir = os.path.abspath(save_dir)
    allowed_roots = [tests_root]
    if allow_playtest:
        project_root = os.path.dirname(tests_root)
        allowed_roots.append(os.path.join(project_root, "game", "playtest"))

    assert any(abs_save_dir.startswith(root) for root in allowed_roots), (
        f"SAFETY GUARD: save_dir '{save_dir}' (resolved: '{abs_save_dir}') "
        f"is NOT under tests directory '{tests_root}'. "
        "Refusing to proceed with teardown cleanup to prevent accidental "
        "production data loss."
    )


def _chmod_retry(func, path, exc_info):
    """Error handler for shutil.rmtree that fixes read-only permissions and retries."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except OSError:
        pass


def safe_rmtree(path):
    """Remove a directory tree, handling read-only files via chmod retry."""
    shutil.rmtree(path, onerror=_chmod_retry)
