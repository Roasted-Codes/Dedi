#!/bin/bash

# Define the absolute path to your xemu directory
XEMU_DIR="/home/ubuntu/Desktop/xemu"
XEMU_APP="/home/ubuntu/Desktop/xemu/xemu.AppImage"
XEMU_CONFIG="/home/ubuntu/Desktop/xemu/xemu.toml"

# Check if directory exists
if [ ! -d "$XEMU_DIR" ]; then
    logger -t "xemu-startup" "Error: XEMU directory not found at $XEMU_DIR"
    exit 1
fi

# Set the data directory with absolute path
export XDG_DATA_HOME="/home/ubuntu/Desktop/xemu/xemu_data"

# Set runtime directory to prevent crashes
# Using absolute path for user ID
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

# Change to the xemu directory before running
cd "$XEMU_DIR" || {
    logger -t "xemu-startup" "Error: Could not change to directory $XEMU_DIR"
    exit 1
}

# Check if AppImage exists and is executable
if [ ! -f "$XEMU_APP" ]; then
    logger -t "xemu-startup" "Error: XEMU AppImage not found at $XEMU_APP"
    exit 1
fi

# Make sure AppImage is executable
chmod +x "$XEMU_APP"

# Run the AppImage with absolute paths
"$XEMU_APP" -config_path "$XEMU_CONFIG"
