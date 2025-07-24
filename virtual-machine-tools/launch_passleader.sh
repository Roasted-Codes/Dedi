#!/bin/bash

# Check if we're running in a terminal
if [ ! -t 0 ]; then
    # If not in terminal, relaunch in Konsole
    konsole --noclose -e "$0"
    exit
fi

# Check if xemu is already running
check_xemu() {
    if ! wmctrl -l | grep "xemu | v" > /dev/null; then
        return 1
    fi
    return 0
}

# Check if another instance of passleader is running
check_passleader() {
    if pgrep -f "/passleader.sh$" > /dev/null; then
        return 0
    fi
    return 1
}

# If passleader is already running, inform and exit
if check_passleader; then
    echo "Passleader is already running!"
    exit 1
fi

# Wait for xemu window to appear
echo "Waiting for Xemu window..."
timeout=30
while [ $timeout -gt 0 ]; do
    if check_xemu; then
        break
    fi
    echo "Waiting for Xemu... ($timeout seconds remaining)"
    sleep 1
    ((timeout--))
done

if [ $timeout -eq 0 ]; then
    echo "Timeout waiting for Xemu to start. Is Xemu running?"
    exit 1
fi

# Give Xemu a few more seconds to fully initialize
sleep 5

# Launch passleader
echo "Xemu detected, starting Passleader..."
exec $(dirname "$0")/passleader.sh 