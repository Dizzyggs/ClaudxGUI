#!/bin/bash

# Claude Code Permission Wrapper
# This script intercepts Claude Code execution and adds permission checking

ORIGINAL_CLAUDE="/usr/local/bin/claude"
WRAPPER_LOG="/tmp/claude-wrapper.log"
PERMISSION_REQUIRED=false

echo "$(date): Claude wrapper called with args: $@" >> "$WRAPPER_LOG"

# Check if this is a dangerous operation
for arg in "$@"; do
    if [[ "$arg" == *"rm "* ]] || [[ "$arg" == *"delete"* ]] || [[ "$arg" == *"unlink"* ]]; then
        echo "$(date): Dangerous operation detected: $arg" >> "$WRAPPER_LOG"
        PERMISSION_REQUIRED=true
        break
    fi
done

# If permission is required, block the operation
if [ "$PERMISSION_REQUIRED" = true ]; then
    echo "$(date): BLOCKED: Dangerous operation requires permission" >> "$WRAPPER_LOG"
    echo "🚨 SECURITY VIOLATION: Dangerous operation blocked. Permission required."
    exit 1
fi

# Otherwise, execute the original Claude
echo "$(date): Executing original Claude" >> "$WRAPPER_LOG"
exec "$ORIGINAL_CLAUDE" "$@"