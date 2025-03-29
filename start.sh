#!/bin/bash

# Get the directory where this script is located
APP_DIR="$(dirname "$(realpath "$0")")"
# Set the path to the configuration file
CONFIG_PATH="$APP_DIR/xemu.toml"

# Set location for xemu data files
export XDG_DATA_HOME="$APP_DIR/xemu_data"
# Set runtime directory, using system default if already defined
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
# Disable audio output
export SDL_AUDIODRIVER=dummy

# Launch xemu with the specified config file in the background
"$APP_DIR/xemu.AppImage" -config_path "$CONFIG_PATH" &
