#!/bin/bash

# Get Xemu window
WINDOW_ID=$(wmctrl -l | grep "xemu | v" | cut -d' ' -f1)

echo "Starting B -> A loop. Press Ctrl+C to stop."
echo "Window ID: $WINDOW_ID"

# Press F6
echo "Pressing F6 to load snapshot on Xemu startup..."
xdotool windowactivate --sync "$WINDOW_ID"
xdotool keydown F6
sleep 0.05  # 50 milliseconds
xdotool keyup F6
echo "F6 pressed and released"

count=1
while true; do
    echo "Sequence $count:"
    
    # Press B
    echo "Pressing B..."
    xdotool windowactivate --sync "$WINDOW_ID"
    xdotool keydown b
    sleep 0.05  # 50 milliseconds
    xdotool keyup b
    echo "B pressed and released"
    
    # Wait 1 second
    echo "Waiting 1 second..."
    sleep 1
    
    # Press A
    echo "Pressing A..."
    xdotool windowactivate --sync "$WINDOW_ID"
    xdotool keydown a
    sleep 0.05  # 50 milliseconds
    xdotool keyup a
    echo "A pressed and released"
    
    # 20 second countdown
    for i in {20..1}; do
        echo -ne "Next sequence in $i seconds...\r"
        sleep 1
    done
    echo -e "\nStarting next sequence"
    
    ((count++))
done