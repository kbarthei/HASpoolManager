#!/usr/bin/env python3
"""
PreToolUse hook for the Bash tool.

Three responsibilities:
  1) BLOCK any command that uses `cd` as a prefix (the working directory is
     already the project root — see CLAUDE.md).
  2) BLOCK addon-deploy / live-API commands when the Mac isn't on the
     HA LAN. Calling scripts/ha-reachable.sh first means Claude finds
     out in <2s that we're off-LAN instead of waiting for scp/curl to
     time out 30s later (or worse, half-build a 168MB tar). Off-LAN is
     the most common reason a deploy in this project fails.
  3) AUTO-APPROVE complex read-only pipelines that the static
     `permissions.allow` list can't easily express.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time

# Verbs whose output is safe to read. Stays conservative on purpose —
# anything that mutates disk, network, or process state must NOT be here.
SAFE_READ_VERBS = {
    # File listing / stat
    "ls", "find", "tree", "stat", "file", "du", "wc", "which", "whoami",
    # File reading
    "cat", "head", "tail", "less", "more",
    # Text processing
    "grep", "egrep", "fgrep", "rg", "awk", "sed", "sort", "uniq", "cut",
    "tr", "nl", "tac", "rev", "fold", "expand", "tee",
    # Data transforms (read-only on input)
    "jq", "yq", "xargs", "diff", "comm", "join",
    # Misc safe
    "echo", "printf", "true", "false", "test",
    # Read-only git / tooling
    "git",   # we trust further filtering via DANGER_PATTERNS
    "gh",
    "docker",  # trust DANGER_PATTERNS to block destructive subcommands
    "npm", "npx", "node",
    "sqlite3",
    "curl",  # GET-only by default; POST/PUT/DELETE are flagged below
}

# Patterns that disqualify a command from auto-approve, even if every verb
# looks safe. These are "this is not actually read-only".
DANGER_PATTERNS = [
    # Output redirections (any kind of write to disk)
    r"(?<![<&])>\s",     # `> file` (but not `>>`/`>&` — covered separately)
    r">>\s",
    r"\btee\s",          # `tee` writes
    # Destructive shell verbs
    r"\brm\s+(-[rRf]|--)",
    r"\bmv\s",
    r"\bchmod\s",
    r"\bchown\s",
    r"\bdd\s",
    r"\bmkfs\b",
    r"\btruncate\s",
    r"\bsudo\b",
    # Curl with a write method
    r"\bcurl\b[^|;&]*-X\s+(POST|PUT|DELETE|PATCH)",
    r"\bcurl\b[^|;&]*--data\b",
    r"\bcurl\b[^|;&]*-d\s",
    # Git mutations
    r"\bgit\s+push\b",
    r"\bgit\s+reset\b",
    r"\bgit\s+rebase\b",
    r"\bgit\s+merge\b",
    r"\bgit\s+commit\b",
    r"\bgit\s+add\b",
    r"\bgit\s+pull\b",
    r"\bgit\s+checkout\b",
    r"\bgit\s+branch\s+-[dD]\b",
    r"\bgit\s+clean\b",
    r"\bgit\s+rm\b",
    # GitHub / Vercel mutations
    r"\bgh\s+(workflow\s+run|pr\s+(create|merge|close)|release\s+(create|delete)|run\s+rerun)\b",
    # Docker mutations
    r"\bdocker\s+(run|rm|kill|stop|start|exec|build|push|pull|tag|cp|prune|system)\b",
    # npm mutations
    r"\bnpm\s+(install|i|publish|update|uninstall|remove|rm|version|deprecate)\b",
    r"\bnpx\s+--save\b",
    # SQL writes
    r"\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM|DROP|ALTER|CREATE)\b",
    # Process control
    r"\bkill\s",
    r"\bpkill\s",
    # Cron / launchctl / systemd
    r"\b(launchctl|systemctl|crontab)\s",
]


# Commands that require the HA addon to be reachable on the LAN. Each
# pattern is matched against a *segment's first chunk* (i.e. the executable
# call) — anchoring this strictly is critical, otherwise the patterns
# match substrings inside commit messages, file contents, etc., and the
# hook would block its own commit. Saves 30+ seconds of timing out and,
# in deploy's case, ~90s of wasted build effort.
REQUIRES_LAN_PATTERNS = [
    r"^\.\/ha-addon\/deploy\.sh(\s|$)",
    r"^npm\s+(run\s+)?screenshots(\s|$)",
    r"^bash\s+ha-addon\/deploy\.sh(\s|$)",
]
# Live admin queries against the addon — these only make sense on-LAN.
# Matched against the FULL segment because the URL can appear anywhere
# after the curl flags. Hostname must be exactly homeassistant[.local]
# at a port (not just any string containing it) to avoid false positives.
REQUIRES_LAN_FULL_SEGMENT = [
    r"\bcurl\b[^']*[\"']?https?://homeassistant(\.local)?:[0-9]+/api/v1/admin/",
]

# We cache the ha-reachable result for a short window so back-to-back
# allowed commands don't ping/curl on every call. Cache lives in /tmp.
_REACHABLE_CACHE = "/tmp/haspoolmanager-ha-reachable.cache"
_REACHABLE_TTL_S = 30


def _ha_reachable_cached() -> tuple[bool, str]:
    """Return (ok, message). Cached for _REACHABLE_TTL_S seconds."""
    now = time.time()
    try:
        st = os.stat(_REACHABLE_CACHE)
        if now - st.st_mtime < _REACHABLE_TTL_S:
            with open(_REACHABLE_CACHE) as f:
                line = f.read().strip()
            if line.startswith("ok:"):
                return True, line[3:]
            if line.startswith("fail:"):
                return False, line[5:]
    except FileNotFoundError:
        pass
    except Exception:
        pass

    script = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "scripts",
        "ha-reachable.sh",
    )
    try:
        res = subprocess.run(
            ["bash", script],
            capture_output=True,
            text=True,
            timeout=8,
        )
        ok = res.returncode == 0
        msg = (res.stderr or res.stdout or "").strip().splitlines()[-1] if (res.stderr or res.stdout) else ""
    except subprocess.TimeoutExpired:
        ok, msg = False, "ha-reachable: probe timed out (8s)"
    except Exception as e:
        ok, msg = False, f"ha-reachable: probe failed to run ({e})"

    try:
        with open(_REACHABLE_CACHE, "w") as f:
            f.write(("ok:" if ok else "fail:") + msg)
    except Exception:
        pass
    return ok, msg


def _needs_lan(cmd: str) -> bool:
    """True iff this command actually invokes a deploy / live-admin
    operation. We only inspect the *first* command of the line — that's
    where the real invocation lives. Substrings inside quoted commit
    messages, sed patterns, etc. don't trigger because they only ever
    appear after the first command.
    """
    head = cmd.lstrip()
    # Trim to the first segment boundary (||, &&, |, ;), so a pipeline
    # later in the line doesn't matter.
    head = re.split(r"\|\||&&|\||;", head, maxsplit=1)[0].strip()
    for pat in REQUIRES_LAN_PATTERNS:
        if re.match(pat, head):
            return True
    # Live-admin curls can appear anywhere in the line; check the full
    # command string but the pattern itself is strict (must include the
    # exact URL scheme + port).
    for pat in REQUIRES_LAN_FULL_SEGMENT:
        if re.search(pat, cmd):
            return True
    return False


def is_cd_prefix(cmd: str) -> bool:
    s = cmd.lstrip()
    return s.startswith("cd ") or s.startswith('cd"') or s.startswith("cd/")


def split_segments(cmd: str) -> list[str]:
    # Naive splitter that handles |, &&, ||, ;. Doesn't honour quoting,
    # which is fine — if a separator appears inside quotes the worst case
    # is we pessimise and skip auto-approval.
    return [s.strip() for s in re.split(r"\|\||&&|\||;", cmd) if s.strip()]


def first_token(seg: str) -> str:
    seg = seg.strip()
    # Strip leading "!" or "{" or "(" used in shells
    seg = re.sub(r"^[!{(]\s*", "", seg)
    if not seg:
        return ""
    return seg.split()[0]


def is_pure_read_only(cmd: str) -> bool:
    if any(re.search(p, cmd, re.IGNORECASE) for p in DANGER_PATTERNS):
        return False
    segments = split_segments(cmd)
    if not segments:
        return False
    for seg in segments:
        verb = first_token(seg)
        if verb not in SAFE_READ_VERBS:
            return False
    return True


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    cmd = (payload.get("tool_input") or {}).get("command", "")
    if not isinstance(cmd, str) or not cmd.strip():
        return 0

    if is_cd_prefix(cmd):
        sys.stdout.write(json.dumps({
            "decision": "block",
            "reason": "Do not use cd prefix. The working directory is already the project root. Run commands directly.",
        }))
        return 0

    if _needs_lan(cmd):
        ok, msg = _ha_reachable_cached()
        if not ok:
            sys.stdout.write(json.dumps({
                "decision": "block",
                "reason": (
                    f"HA addon is not reachable from this Mac right now ({msg}). "
                    "Deploy / live-admin commands are blocked until the Mac is on the printer LAN. "
                    "If you're sure the addon is reachable at a non-default host, set "
                    "HASPOOLMANAGER_SSH_HOST + HASPOOLMANAGER_HEALTH_URL env vars. "
                    "Cached result lives in /tmp/haspoolmanager-ha-reachable.cache for 30s; "
                    "delete it to force a re-probe."
                ),
            }))
            return 0

    if is_pure_read_only(cmd):
        sys.stdout.write(json.dumps({"decision": "approve"}))
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
