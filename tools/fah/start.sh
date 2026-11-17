#!/bin/bash
set -euo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runtime="$workspace/.local/fah-venv/bin/python"
if [[ ! -x "$runtime" ]]; then
    echo "Run bash tools/fah/setup.sh first" >&2
    exit 1
fi
exec "$runtime" "$workspace/tools/fah/server.py" --device mps "$@"
