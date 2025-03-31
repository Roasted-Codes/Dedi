#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(dirname "$(realpath "$0")")"

# Use the xemu.toml file in the same directory as the script
CONFIG_PATH="$SCRIPT_DIR/xemu.toml"

# Set the data directory (attempting to use XDG specification)
export XDG_DATA_HOME="$SCRIPT_DIR/xemu_data"

# XDG_RUNTIME_DIR defines a user-specific directory for runtime files
# It typically points to /run/user/<uid> and is used for:
# - Temporary runtime files
# - Communication sockets
# - State information that doesn't need to persist across reboots
# This is part of the XDG Base Directory Specification
export XDG_RUNTIME_DIR=/run/user/$(id -u)

# Set SDL audio driver to dummy (disables audio output)
export SDL_AUDIODRIVER=dummy

# Run xemu with the config_path
xemu -config_path "$CONFIG_PATH" &
