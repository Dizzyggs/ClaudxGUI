#!/bin/bash

# 🚨 CRITICAL SECURITY WRAPPER - Real Filesystem Protection
# This wrapper implements ACTUAL security by checking tool permissions before execution

ORIGINAL_CLAUDE="/usr/local/bin/claude"
WRAPPER_LOG="/tmp/claude-secure-wrapper.log"
PERMISSION_FILE="/tmp/claude-permissions.json"

echo "$(date): 🔒 SECURE Claude wrapper starting - checking tool permissions" >> "$WRAPPER_LOG"
echo "$(date): Args: $*" >> "$WRAPPER_LOG"

# Parse arguments to check if dangerous tools are disallowed
DISALLOWED_TOOLS=""
ALLOWED_TOOLS=""
EDIT_DISALLOWED=false
WRITE_DISALLOWED=false

# Extract disallowed tools from arguments
for arg in "$@"; do
    if [[ "$arg" == "--disallowedTools" ]]; then
        NEXT_IS_DISALLOWED=true
        continue
    fi
    if [[ "$NEXT_IS_DISALLOWED" == "true" ]]; then
        DISALLOWED_TOOLS="$DISALLOWED_TOOLS $arg"
        if [[ "$arg" == "Edit" || "$arg" == "MultiEdit" ]]; then
            EDIT_DISALLOWED=true
        fi
        if [[ "$arg" == "Write" ]]; then
            WRITE_DISALLOWED=true
        fi
        NEXT_IS_DISALLOWED=false
        continue
    fi
done

echo "$(date): 🔍 Security check - Edit disallowed: $EDIT_DISALLOWED, Write disallowed: $WRITE_DISALLOWED" >> "$WRAPPER_LOG"

# If Edit is disallowed, run Claude with filesystem monitoring
if [[ "$EDIT_DISALLOWED" == "true" ]]; then
    echo "$(date): ⚠️  Edit tools are DISALLOWED - implementing strict filesystem monitoring" >> "$WRAPPER_LOG"
    
    # Get the project directory from the current working directory
    PROJECT_DIR=$(pwd)
    echo "$(date): 📁 Monitoring project directory: $PROJECT_DIR" >> "$WRAPPER_LOG"
    
    # Start Node.js filesystem monitoring in background
    MONITOR_SCRIPT="/home/freddan11/projects/ClaudxGUI/filesystem-monitor.cjs"
    echo "$(date): 🚀 Starting Node.js filesystem monitor" >> "$WRAPPER_LOG"
    node "$MONITOR_SCRIPT" "$PROJECT_DIR" &
    MONITOR_PID=$!
    
    # Store monitor PID for cleanup
    echo $MONITOR_PID > "/tmp/claude-monitor.pid"
    
    # Run Claude normally (foreground) - this preserves stdin/stdout
    echo "$(date): 🚀 Starting Claude with monitoring active" >> "$WRAPPER_LOG"
    "$ORIGINAL_CLAUDE" "$@"
    CLAUDE_EXIT_CODE=$?
    
    # Cleanup monitoring
    if [[ -n "$MONITOR_PID" ]]; then
        kill $MONITOR_PID 2>/dev/null
        rm -f "/tmp/claude-monitor.pid"
    fi
    
    # Check if Claude was killed by our security monitor
    if [[ -f "/tmp/claude-security-violation.flag" ]]; then
        echo "$(date): 🚨 Claude was terminated by security monitor" >> "$WRAPPER_LOG"
        CLAUDE_EXIT_CODE=1
    fi
    
    echo "$(date): 🏁 Claude finished with exit code: $CLAUDE_EXIT_CODE" >> "$WRAPPER_LOG"
    exit $CLAUDE_EXIT_CODE
else
    # Normal execution if edit is allowed
    echo "$(date): ✅ Edit tools are allowed - normal execution" >> "$WRAPPER_LOG"
    exec "$ORIGINAL_CLAUDE" "$@"
fi