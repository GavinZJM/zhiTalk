# Agent Hooks

Command hooks run at agent lifecycle points. Configure them in `~/.zjmTalk/zjmTalk.json`
(same file as `model` / `env`). The `version` + `hooks` shape is unchanged from the old `hooks.json`.

## Exit codes

| Exit | Meaning |
|------|---------|
| 0 | Continue |
| 1 | Block; stderr (or stdout) is the error |
| 2 | Inject stderr into the conversation, then continue |

Timeouts / crashes: fail-open (continue) unless `"failClosed": true`.

## Events

- **PreToolUse** / **PostToolUse** — `matcher` is a JS RegExp against tool name (`"*"` or empty = all tools)
- **SessionStart** / **SessionEnd** — CLI session lifecycle
- **UserPromptSubmit** — before each user message is sent to the agent

Scripts receive a JSON payload on stdin (`hook_event_name`, `cwd`, `thread_id`, plus event-specific fields).

`command` paths are resolved with `cwd = process.cwd()` (project root).

When a matching hook runs, the CLI prints `[Hook Event] <command> → exit N` plus any stdout/stderr (hook I/O is piped, so without this log you would not see `echo` output).
