#!/usr/bin/env bash
# Starts the avatar server on http://127.0.0.1:8010 (localhost only; set LT_HOST=0.0.0.0 to expose it).
# Extra arguments are passed to LiveTalking, e.g. ./start.sh --llm_model nvidia/nemotron-3-super-120b-a12b
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/livetalking"
exec "$here/venv/bin/python" app.py \
  --transport webrtc \
  --model wav2lip --avatar_id wav2lip256_avatar1 \
  --tts edgetts --REF_FILE en-US-AvaNeural \
  --llm_provider nvidia "$@"
