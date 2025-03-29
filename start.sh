#!/bin/bash

# Get the directory where the AppImage is located
APP_DIR="$(dirname "$(realpath "$0")")"

# Use the xemu.toml file in the same directory as the AppImage
CONFIG_PATH="$APP_DIR/xemu.toml"

# Set the data directory (attempting to use XDG specification)
export XDG_DATA_HOME="$APP_DIR/xemu_data"

# Set dummy audio driver to disable sound
export SDL_AUDIODRIVER=dummy

# Set XDG_RUNTIME_DIR if not already set
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

# Run the AppImage with the config_path
"$APP_DIR/xemu.AppImage" -config_path "$CONFIG_PATH" &
