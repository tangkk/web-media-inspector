#!/usr/bin/env bash
set -euo pipefail

label="com.tangkk.web-media-inspector-recording"
plist="$HOME/Library/LaunchAgents/$label.plist"
user_id="$(id -u)"

launchctl bootout "gui/$user_id" "$plist" 2>/dev/null || true
if [[ "${1:-}" == "--disable" ]]; then
  launchctl disable "gui/$user_id/$label"
  echo "Stopped local recording bridge and disabled automatic startup."
else
  echo "Stopped local recording bridge. It will start again at your next login."
  echo "Run with --disable to disable automatic startup too."
fi
