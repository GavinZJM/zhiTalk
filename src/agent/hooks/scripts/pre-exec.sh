#!/bin/sh
# Example PreToolUse hook for tools whose name matches /exec/.
# Reads JSON on stdin. Exit codes:
#   0 — continue
#   1 — block (stderr → error)
#   2 — inject stderr into conversation, then continue
#
# Default: audit to stderr and continue (exit 0).
# Uncomment the exit 1 block below to deny, or exit 2 to inject a note.

input=$(cat)
tool_name=$(printf '%s' "$input" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
# lightweight extract; prefer jq if available
if command -v jq >/dev/null 2>&1; then
  tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')
fi

printf 'pre-exec hook: allowing tool %s\n' "${tool_name:-unknown}" >&2
exit 0
