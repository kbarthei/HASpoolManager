"""
Smoke tests for the bash-pre-tool-use hook. Not part of the project test
suite — invoke manually:

    python3 .claude/hooks/test_bash_pre_tool_use.py

The hook intercepts Claude's own Bash invocations, so executing it inline
with `echo ... | python3 hook.py` would block its own test inputs (the
substring detection is intentionally aggressive). This file invokes the
parsed handlers directly so we can assert on pure logic.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from unittest.mock import patch

HOOK_PATH = os.path.join(os.path.dirname(__file__), "bash-pre-tool-use.py")
spec = importlib.util.spec_from_file_location("bash_hook", HOOK_PATH)
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)


class CdPrefixTests(unittest.TestCase):
    def test_blocks_cd_path_and(self):
        self.assertTrue(hook.is_cd_prefix("cd /tmp && ls"))

    def test_allows_cdfoo_command(self):
        self.assertFalse(hook.is_cd_prefix("cdrun --help"))


class LanGatedTests(unittest.TestCase):
    def test_deploy_sh_matches(self):
        self.assertTrue(hook._needs_lan("./ha-addon/deploy.sh"))

    def test_deploy_sh_with_flags_matches(self):
        self.assertTrue(hook._needs_lan("./ha-addon/deploy.sh --no-bump"))

    def test_npm_screenshots_matches(self):
        self.assertTrue(hook._needs_lan("npm run screenshots"))

    def test_admin_curl_matches(self):
        self.assertTrue(
            hook._needs_lan('curl -X POST "http://homeassistant:3001/api/v1/admin/query"')
        )

    def test_admin_curl_local_matches(self):
        self.assertTrue(hook._needs_lan('curl "http://homeassistant.local:3001/api/v1/admin/x"'))

    def test_unrelated_curl_does_not_match(self):
        self.assertFalse(hook._needs_lan("curl https://example.com/api"))

    def test_normal_ls_does_not_match(self):
        self.assertFalse(hook._needs_lan("ls -la /tmp"))

    def test_unrelated_npm_does_not_match(self):
        self.assertFalse(hook._needs_lan("npm run test:unit"))

    def test_substring_inside_commit_message_does_not_match(self):
        # Regression: the v1 patterns matched `./ha-addon/deploy.sh` as a
        # substring anywhere — including inside a quoted commit message —
        # so the hook ended up blocking its own git commit.
        cmd = (
            'git commit -m "fix(deploy): pre-flight calls scripts/ha-reachable.sh '
            'before building. Replaces the silent fall-through in ./ha-addon/deploy.sh"'
        )
        self.assertFalse(hook._needs_lan(cmd))

    def test_substring_in_quoted_argument_does_not_match(self):
        # Same idea, different vector: a sed pattern that contains the
        # deploy.sh literal.
        self.assertFalse(hook._needs_lan("sed -i '' 's|./ha-addon/deploy.sh|x|' README.md"))


class ReadOnlyTests(unittest.TestCase):
    def test_simple_ls(self):
        self.assertTrue(hook.is_pure_read_only("ls -la"))

    def test_pipe_pipeline(self):
        self.assertTrue(hook.is_pure_read_only("find . -name '*.ts' | wc -l"))

    def test_blocks_rm(self):
        self.assertFalse(hook.is_pure_read_only("rm -rf node_modules"))

    def test_blocks_git_commit(self):
        self.assertFalse(hook.is_pure_read_only("git commit -m foo"))

    def test_blocks_write_redirect(self):
        self.assertFalse(hook.is_pure_read_only("echo foo > /tmp/bar"))


class ReachabilityCacheTests(unittest.TestCase):
    """The cache should short-circuit repeated probes within TTL."""

    def setUp(self):
        # Clean cache before each test
        try:
            os.remove(hook._REACHABLE_CACHE)
        except FileNotFoundError:
            pass

    def test_failure_is_cached(self):
        # Mock the subprocess call so we count invocations
        with patch.object(hook, "subprocess") as mock_sp:
            mock_sp.run.return_value = type(
                "R", (), {"returncode": 1, "stdout": "", "stderr": "ha-reachable: fake"}
            )
            mock_sp.TimeoutExpired = type("T", (Exception,), {})
            ok1, msg1 = hook._ha_reachable_cached()
            ok2, msg2 = hook._ha_reachable_cached()
        self.assertFalse(ok1)
        self.assertFalse(ok2)
        self.assertEqual(msg1, msg2)
        self.assertEqual(mock_sp.run.call_count, 1)  # second hit was cached


if __name__ == "__main__":
    unittest.main(verbosity=2)
