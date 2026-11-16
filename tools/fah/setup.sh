#!/bin/bash
set -euo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
python_command="${PYTHON:-python3}"
config_source="maccap"
revision="2b13dd9c7fc04ad173a76ab89beac9266d2d59ac"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --python|--config-source)
            if [[ $# -lt 2 ]]; then
                echo "Missing value for $1" >&2
                exit 2
            fi
            case "$1" in
                --python) python_command="$2" ;;
                --config-source) config_source="$2" ;;
            esac
            shift 2
            ;;
        --help|-h)
            echo "Usage: bash tools/fah/setup.sh [--python python3.12] [--config-source maccap|official]"
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 2
            ;;
    esac
done

if [[ "$config_source" != "maccap" && "$config_source" != "official" ]]; then
    echo "Use --config-source maccap or official" >&2
    exit 2
fi
if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
    echo "FAH Mac setup requires native Apple Silicon. Use tools/start.py for the browser modes." >&2
    exit 1
fi
"$python_command" -c 'import platform, sys; assert platform.machine() == "arm64", "Use native arm64 Python, not Rosetta"; assert (3, 10) <= sys.version_info < (3, 13), "Use Python 3.10-3.12 (recommended: 3.12)"'
command -v git >/dev/null

environment="$workspace/.local/fah-venv"
runtime="$environment/bin/python"
upstream="$workspace/.local/FAH"
if [[ ! -x "$runtime" ]]; then
    if [[ -e "$environment" ]]; then
        echo "Existing .local/fah-venv is not a Mac environment; preserve or rename it and retry." >&2
        exit 1
    fi
    "$python_command" -m venv "$environment"
fi
"$runtime" -c 'import platform, sys; assert platform.machine() == "arm64"; assert (3, 10) <= sys.version_info < (3, 13)'
if [[ ! -d "$upstream/.git" ]]; then
    git clone https://github.com/noahcao/FAH.git "$upstream"
    git -C "$upstream" checkout --detach "$revision"
fi
if [[ "$(git -C "$upstream" rev-parse HEAD)" != "$revision" ]]; then
    echo "Existing FAH checkout differs from pinned $revision; retained without changes." >&2
    exit 1
fi
"$runtime" -m pip install torch==2.8.0 torchvision==0.23.0
"$runtime" -m pip install -r "$workspace/tools/fah/requirements.txt" -e "$upstream"
"$runtime" -m pip check
"$runtime" -c 'import torch; assert torch.backends.mps.is_available(), "MPS unavailable; no automatic CPU fallback"; matrix = torch.ones((32, 32), device="mps"); result = matrix @ matrix; torch.mps.synchronize(); assert result[0, 0].item() == 32; print("MPS compute smoke check passed (not a FAH benchmark)")'
"$runtime" "$workspace/tools/fah/prepare.py" --config-source "$config_source"
echo "Ready to try: bash tools/fah/start.sh (Mac FAH inference still requires on-device acceptance)"
