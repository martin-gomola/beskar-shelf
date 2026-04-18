#!/usr/bin/env bash
# Shared shim helper: exec the beskar-tools venv Python with a given module.
#
# Usage (from a tool wrapper script):
#
#   #!/usr/bin/env bash
#   exec "$(dirname "${BASH_SOURCE[0]}")/.../_shim.sh" beskar_tools.cli.grab "$@"
#
# The first argument is the module path; the rest is forwarded to Python.

set -euo pipefail

MODULE="${1:?missing module path}"
shift

SCRIPT_PATH="${BESKAR_SHIM_CALLER:-${0}}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

# Walk upward until we find tools/pyproject.toml (works regardless of how deep
# the calling script is inside tools/).
find_tools_dir() {
    local dir="$1"
    while [ "$dir" != "/" ]; do
        if [ -f "$dir/pyproject.toml" ] && grep -q 'beskar-tools' "$dir/pyproject.toml" 2>/dev/null; then
            printf '%s\n' "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    return 1
}

TOOLS_DIR="$(find_tools_dir "$SCRIPT_DIR" || true)"
if [ -z "$TOOLS_DIR" ]; then
    echo "beskar-tools: could not locate tools/pyproject.toml from $SCRIPT_DIR" >&2
    exit 1
fi

VENV_PY="$TOOLS_DIR/.venv/bin/python"
if [ ! -x "$VENV_PY" ]; then
    cat >&2 <<EOF
beskar-tools is not installed yet.

Run once to bootstrap the Python venv with pinned dependencies:

  make install-tools

(or manually: python3 -m venv tools/.venv && tools/.venv/bin/pip install -e tools)
EOF
    exit 1
fi

exec "$VENV_PY" -m "$MODULE" "$@"
