#!/bin/sh
# PostToolUse hook: append tool name + args to ./tools.log (cwd = project root).
# Exit 0 — continue

input=$(cat)
ts=$(date '+%Y-%m-%d %H:%M:%S')

# Prefer node (always available in this project) for reliable JSON parsing
parsed=$(printf '%s' "$input" | node -e '
  let s = "";
  process.stdin.on("data", (d) => { s += d; });
  process.stdin.on("end", () => {
    try {
      const j = JSON.parse(s);
      const name = j.tool_name == null ? "unknown" : String(j.tool_name);
      const args = j.tool_input == null ? {} : j.tool_input;
      process.stdout.write(name + "\t" + JSON.stringify(args));
    } catch {
      process.stdout.write("unknown\t{}");
    }
  });
')

tool_name=${parsed%%	*}
args_json=${parsed#*	}

printf '%s\tname=%s\targs=%s\n' "$ts" "$tool_name" "$args_json" >> tools.log
exit 0
