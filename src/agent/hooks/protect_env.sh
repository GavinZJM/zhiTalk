#!/bin/sh
# PreToolUse hook: block reading .env / .env.* via read_file or exec.
# Exit 0 — allow
# Exit 1 — block (stderr → tool error)
# Exit 2 — inject stderr, then continue

input=$(cat)

tool_name=""
file_path=""
command=""

if command -v jq >/dev/null 2>&1; then
  tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')
  file_path=$(printf '%s' "$input" | jq -r '
    .tool_input.file_path
    // .tool_input.filepath
    // .tool_input.path
    // empty
  ')
  command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
else
  tool_name=$(printf '%s' "$input" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
  file_path=$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
  if [ -z "$file_path" ]; then
    file_path=$(printf '%s' "$input" | sed -n 's/.*"filepath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
  fi
  if [ -z "$file_path" ]; then
    file_path=$(printf '%s' "$input" | sed -n 's/.*"path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
  fi
  command=$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
fi

is_env_path() {
  _p=$1
  [ -z "$_p" ] && return 1
  [ "$_p" = "null" ] && return 1
  _base=${_p##*/}
  case "$_base" in
    .env|.env.*) return 0 ;;
  esac
  case "$_p" in
    */.env|*/.env.*|.env|.env.*) return 0 ;;
  esac
  return 1
}

# read_file / path-style tools
if is_env_path "$file_path"; then
  printf 'Access denied: reading "%s" is blocked by protect_env hook.\n' "$file_path" >&2
  exit 1
fi

# exec: block commands that reference .env / .env.* as a path-like token
# e.g. cat .env, head ./.env.local, type ".env", Get-Content .env
if [ -n "$command" ] && [ "$command" != "null" ]; then
  if printf '%s' "$command" | grep -Eq '(^|[[:space:]/"'"'"'=])\.env([^[:alnum:]_]|$)'; then
    printf 'Access denied: command may read a .env file and is blocked by protect_env hook.\n' >&2
    printf 'tool: %s\n' "${tool_name:-exec}" >&2
    printf 'command: %s\n' "$command" >&2
    exit 1
  fi
fi

exit 0
