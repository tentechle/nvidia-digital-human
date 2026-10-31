#!/usr/bin/env bash
# Saves your build.nvidia.com API key to livetalking/.env without echoing it.
set -euo pipefail
env_file="$(cd "$(dirname "$0")" && pwd)/livetalking/.env"

read -rsp "Paste your NVIDIA API key (from build.nvidia.com), then press Enter: " key
echo
if [[ -z "$key" ]]; then echo "No key entered; nothing saved."; exit 1; fi
[[ "$key" == nvapi-* ]] || echo "Note: NVIDIA keys usually start with nvapi-"

touch "$env_file"
chmod 600 "$env_file"
{ grep -v '^NVIDIA_API_KEY=' "$env_file" || true; printf 'NVIDIA_API_KEY=%s\n' "$key"; } > "$env_file.tmp"
mv "$env_file.tmp" "$env_file"
chmod 600 "$env_file"
echo "Saved to $env_file (readable only by you). Restart the server to use it."
