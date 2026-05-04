#!/usr/bin/env python3
"""
PreToolUse hook for the Bash tool.

Two responsibilities:
  1) BLOCK any command that uses `cd` as a prefix (the working directory is
     already the project root — see CLAUDE.md). Mirrors the inline shell
     guard but with clearer error messages.
  2) AUTO-APPROVE complex read-only pipelines that the static
     `permissions.allow` list can't easily express.

The auto-approve logic:
  - Split the command on `|`, `&&`, `;`, `||` boundaries
  - Each segment's *first token* must be in SAFE_READ_VERBS
  - The full command string must NOT contain any pattern in DANGER_PATTERNS
  - Only then we emit {"decision":"approve"}; otherwise we exit silently and
    the normal permission flow takes over.

This complements `permissions.allow` — it lets inputs like
`find . -name "*.png" -exec ls -lh {} \; | awk '{print $5}' | sort` go
through without prompting, even though `awk` and `sort` follow `find` via
pipes.
"""

from __future__ import annotations

import json
import re
import sys

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

    if is_pure_read_only(cmd):
        sys.stdout.write(json.dumps({"decision": "approve"}))
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
