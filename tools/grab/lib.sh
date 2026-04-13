#!/usr/bin/env bash

set -euo pipefail

GRAB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BESKAR_REPO_ROOT="$(cd "$GRAB_DIR/../.." && pwd)"

beskar_load_env() {
    if [ -f "$GRAB_DIR/.env" ]; then
        # shellcheck disable=SC1091
        source "$GRAB_DIR/.env"
    fi
}

beskar_resolve_path() {
    local path="$1"

    if [[ "$path" == /* ]]; then
        printf '%s\n' "$path"
    else
        printf '%s\n' "$BESKAR_REPO_ROOT/$path"
    fi
}

beskar_require_command() {
    local name="$1"

    if ! command -v "$name" >/dev/null 2>&1; then
        echo "Missing required command: $name"
        echo "Install it, then rerun the command."
        return 1
    fi
}

beskar_require_file() {
    local path="$1"
    local label="$2"

    if [ ! -f "$path" ]; then
        echo "Missing $label: $path"
        echo "Create it first, then rerun the command."
        return 1
    fi
}

beskar_require_dir_writable() {
    local path="$1"

    mkdir -p "$path" 2>/dev/null || {
        echo "Output directory is not writable: $path"
        echo "Set OUTPUT_DIR to a writable path, then rerun the command."
        return 1
    }

    if [ ! -w "$path" ]; then
        echo "Output directory is not writable: $path"
        echo "Set OUTPUT_DIR to a writable path, then rerun the command."
        return 1
    fi
}

beskar_count_valid_urls() {
    local links_file="$1"

    awk '
        /^[[:space:]]*#/ { next }
        /^[[:space:]]*$/ { next }
        { count++ }
        END { print count + 0 }
    ' "$links_file"
}

beskar_run_preflight() {
    local env_file="$1"
    local links_file="$2"
    local output_dir="$3"

    beskar_require_command yt-dlp || return 1
    beskar_require_command ffmpeg || return 1
    beskar_require_command ffprobe || return 1
    beskar_require_file "$env_file" ".env file" || return 1
    beskar_require_file "$links_file" "links file" || return 1
    beskar_require_dir_writable "$output_dir" || return 1
}
