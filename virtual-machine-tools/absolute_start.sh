#!/bin/bash

# Define the absolute path to your xemu directory
XEMU_DIR="/home/halo/Desktop/xemu"

# Set the data directory with absolute path
export XDG_DATA_HOME="/home/halo/Desktop/xemu/xemu_data"

#idk what the fuck this does but it helps prevent crashes
export XDG_RUNTIME_DIR=/run/user/$(id -u)

# Change to the xemu directory before running (this might help with base path issues)
cd "$XEMU_DIR"

# Run the AppImage with absolute paths in a terminal window
konsole -e bash -c 'cd /home/halo/Desktop/xemu && /home/halo/Desktop/xemu/xemu.AppImage -config_path "/home/halo/Desktop/xemu/xemu.toml"; read -p "Press Enter to close..."' &