#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/../.." && pwd)"
recorder_dir="$(cd "$project_dir/.." && pwd)/sysaudio-rec"
recorder_bin="$recorder_dir/.build/release/sysaudio-rec"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# launchd does not load shell startup files, so make an nvm-installed Node
# available when this script is launched automatically at login.
for node_bin in "$HOME"/.nvm/versions/node/*/bin; do
  if [[ -x "$node_bin/node" && -x "$node_bin/npm" ]]; then
    export PATH="$node_bin:$PATH"
  fi
done

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required." >&2
  exit 1
fi

if [[ ! -x "$recorder_bin" ]]; then
  if [[ ! -d "$recorder_dir" ]]; then
    echo "Missing sibling sysaudio-rec source: $recorder_dir" >&2
    echo "Clone https://github.com/tangkk/sysaudio-rec beside this repository." >&2
    exit 1
  fi
  echo "Building sysaudio-rec…"
  (cd "$recorder_dir" && swift build -c release)
fi

if [[ ! -d "$project_dir/node_modules" ]]; then
  echo "Installing web app dependencies…"
  (cd "$project_dir" && npm install)
fi

echo "Starting local recording bridge at http://localhost:5173"
cd "$project_dir"
exec npm run recording-service
