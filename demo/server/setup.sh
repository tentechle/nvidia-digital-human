#!/usr/bin/env bash
# One-time setup for the photoreal avatar server. Safe to re-run.
#   - clones LiveTalking at the tested commit and applies this demo's patch
#     (NVIDIA LLM provider, English spoken-style prompt, localhost-only binding)
#   - creates a Python 3.12 venv with PyTorch 2.9.1 + CUDA 12.8
#   - downloads the wav2lip256 model and sample avatar from the LiveTalking project
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
lt="$here/livetalking"
commit="$(cat "$here/LIVETALKING_COMMIT")"

echo "==> LiveTalking @ ${commit:0:7}"
[ -d "$lt/.git" ] || git clone https://github.com/lipku/LiveTalking.git "$lt"
git -C "$lt" fetch -q origin "$commit" 2>/dev/null || true
git -C "$lt" checkout -q "$commit"
if git -C "$lt" apply --reverse --check "$here/livetalking-nvidia.patch" 2>/dev/null; then
  echo "    patch already applied"
else
  git -C "$lt" apply "$here/livetalking-nvidia.patch"
  echo "    patch applied"
fi

echo "==> Python environment"
[ -d "$here/venv" ] || python3.12 -m venv "$here/venv"
"$here/venv/bin/pip" install -q -U pip
"$here/venv/bin/pip" install torch==2.9.1 torchvision==0.24.1 torchaudio==2.9.1 --index-url https://download.pytorch.org/whl/cu128
"$here/venv/bin/pip" install -r "$lt/requirements.txt" gdown
"$here/venv/bin/python" -c "import torch; print('    CUDA available:', torch.cuda.is_available())"

echo "==> wav2lip256 model and sample avatar"
if [ ! -f "$lt/models/wav2lip.pth" ]; then
  mkdir -p "$here/downloads" "$lt/models" "$lt/data/avatars"
  "$here/venv/bin/gdown" https://drive.google.com/drive/folders/1FOC_MD6wdogyyX_7V1d4NDIO7P9NlSAJ -O "$here/downloads" --continue
  cp "$here/downloads/wav2lip256.pth" "$lt/models/wav2lip.pth"
  tar -xzf "$here/downloads/wav2lip256_avatar1.tar.gz" -C "$lt/data/avatars"
else
  echo "    already installed"
fi

echo "==> Done. Next: ./set-nvidia-key.sh, then ./start.sh"
