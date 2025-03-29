#!/bin/bash

# Exit on any error
set -e

# Get the directory where the AppImage is located
APP_DIR="$(dirname "$(realpath "$0")")"

# Check if AppImage exists
if [ ! -f "$APP_DIR/xemu.AppImage" ]; then
    echo "Error: xemu.AppImage not found in $APP_DIR"
    exit 1
fi

# Check if config file exists
CONFIG_PATH="$APP_DIR/xemu.toml"
if [ ! -f "$CONFIG_PATH" ]; then
    echo "Warning: xemu.toml not found in $APP_DIR"
fi

# Create data directory if it doesn't exist
export XDG_DATA_HOME="$APP_DIR/xemu_data"
mkdir -p "$XDG_DATA_HOME"

# Set dummy audio driver to disable sound
export SDL_AUDIODRIVER=dummy

# Set XDG_RUNTIME_DIR if not already set
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

# Run the AppImage with the config_path
exec "$APP_DIR/xemu.AppImage" -config_path "$CONFIG_PATH"
