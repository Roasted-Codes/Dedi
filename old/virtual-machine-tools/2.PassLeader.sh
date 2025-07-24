#!/bin/bash

#==============================================================================
# CONFIGURATION SECTION
#==============================================================================
# Pattern used by grep to identify the Xemu window in the window manager list
XEMU_WINDOW_PATTERN="xemu"  # Pattern to match Xemu window title

# How long to hold down each key in seconds (50 milliseconds is usually sufficient)
KEY_PRESS_DURATION=0.05     # Duration in seconds to hold keys

# How long to wait between pressing 'B' and 'A' in each sequence
WAIT_BETWEEN_KEYS=1         # Wait time between B and A keys

# How many seconds to wait between each B-A sequence cycle
SEQUENCE_INTERVAL=20        # Wait time between sequences

# Time to allow Xemu to fully initialize before starting the key sequence
XEMU_INIT_WAIT=5            # Time to wait for Xemu to initialize

#==============================================================================
# INITIAL CHECKS
#==============================================================================
# Show help if requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $(basename "$0")"
    echo "This script automates key presses for Xemu."
    echo "It repeatedly presses B, waits, then presses A."
    echo ""
    echo "Options:"
    echo "  -h, --help    Show this help message and exit"
    exit 0
fi

# Check for required tools
for cmd in wmctrl xdotool; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Error: $cmd is not installed. Please install it first." >&2
        echo "You can typically install it with: sudo apt install $cmd" >&2
        exit 1
    fi
done

# Function to run when script exits
cleanup() {
    echo -e "\nExiting script. Thank you for using Passleader!"
    pkill -f "$(basename "$0")"  # Kill any instances of this script
    exit 0
}

# Register the cleanup function to run when script exits
trap cleanup EXIT INT TERM HUP

#==============================================================================
# TERMINAL DETECTION
#==============================================================================
# Check if the script is being run in a terminal
# The -t 0 test checks if file descriptor 0 (stdin) is connected to a terminal
if [ ! -t 0 ]; then
    # If not running in a terminal, relaunch the script in Konsole
    # --noclose keeps the terminal window open after the script exits
    # -e executes the command that follows (in this case, this script)
    # "$0" represents the current script's filename
    konsole --noclose -e "$0"
    exit  # Exit the current instance since we've launched a new one
fi

#==============================================================================
# UTILITY FUNCTIONS
#==============================================================================
# Function to find and return the Xemu window ID
get_xemu_window() {
    # Command breakdown:
    # wmctrl -l         - Lists all windows managed by the window manager
    # grep -i "$XEMU_WINDOW_PATTERN" - Case-insensitive search for the window title
    # head -n 1         - Take only the first match (if multiple instances exist)
    # cut -d' ' -f1     - Extract the first field (window ID) using space as delimiter
    local window_id=$(wmctrl -l | grep -i "$XEMU_WINDOW_PATTERN" | head -n 1 | cut -d' ' -f1)
    
    # Check if window_id contains a value (not empty)
    if [ -n "$window_id" ]; then
        echo "$window_id"  # Output the window ID to be captured by command substitution
        return 0  # Success exit code
    fi
    
    return 1  # Failure exit code (no window found)
}

# Function to send a keypress to a specific window
send_key() {
    # Parameters:
    # $1 - The key to press (e.g., "a", "b", "F6")
    # $2 - The window ID to send the key to
    # $3 - How long to hold the key (optional, defaults to KEY_PRESS_DURATION)
    local key="$1"
    local window_id="$2"
    local press_time="${3:-$KEY_PRESS_DURATION}"  # Use default if not provided
    
    echo "Pressing $key..."
    # Activate the window before sending keys to ensure it receives the input
    # The --sync flag makes xdotool wait until the window is actually active
    # 2>/dev/null suppresses error messages
    if ! xdotool windowactivate --sync "$window_id" 2>/dev/null; then
        echo "Error: Could not activate window $window_id" >&2  # Error to stderr
        return 1  # Return failure code
    fi
    
    # Simulate pressing the key down
    xdotool keydown "$key"
    # Hold the key for the specified duration
    sleep "$press_time"
    # Release the key
    xdotool keyup "$key"
    echo "$key pressed and released"
    return 0  # Success
}

#==============================================================================
# MAIN FUNCTIONALITY
#==============================================================================
# The main function that handles the B-A button pressing sequence
run_passleader() {
    # $1 is the first argument passed to the function - the Xemu window ID
    local window_id="$1"
    
    echo "Starting B -> A loop. Press Ctrl+C to stop."
    echo "Window ID: $window_id"

    # First action: Press F6 to load a snapshot in Xemu
    echo "Pressing F6 to load snapshot on Xemu startup..."
    # Try to send F6 key, exit if fails
    if ! send_key "F6" "$window_id"; then
        echo "Failed to send F6 keypress, exiting."
        exit 1  # Critical failure, exit the script
    fi

    # Initialize counter for tracking sequence iterations
    count=1
    
    # Infinite loop for continuous B-A sequence
    while true; do
        echo "Sequence $count:"
        
        # Every 5 iterations, refresh the window ID in case it changed
        # The % operator gives the remainder of count/5
        if [ $((count % 5)) -eq 0 ]; then
            echo "Refreshing window ID..."
            new_window_id=$(get_xemu_window)
            # Only update if we found a valid window ID
            if [ -n "$new_window_id" ]; then
                window_id="$new_window_id"
                echo "Window ID updated to: $window_id"
            fi
        fi
        
        # First key in sequence: Press B button
        if ! send_key "b" "$window_id"; then
            # If pressing B failed, try to refresh the window ID
            echo "Failed to send B keypress, refreshing window ID..."
            window_id=$(get_xemu_window)
            # If we still can't find a window, exit
            if [ -z "$window_id" ]; then
                echo "Could not find Xemu window, exiting."
                exit 1
            fi
            # Try pressing B again, continue to next iteration if it fails again
            send_key "b" "$window_id" || continue
        fi
        
        # Wait between B and A keypresses
        echo "Waiting $WAIT_BETWEEN_KEYS second(s)..."
        sleep $WAIT_BETWEEN_KEYS
        
        # Second key in sequence: Press A button
        if ! send_key "a" "$window_id"; then
            # Less critical than B failure, just continue to next sequence
            echo "Failed to send A keypress, continuing to next sequence."
            continue  # Skip to next iteration
        fi
        
        # Wait for next sequence with a countdown
        # seq creates a sequence from SEQUENCE_INTERVAL down to 1
        # -1 specifies counting down (decrementing by 1)
        for i in $(seq $SEQUENCE_INTERVAL -1 1); do
            # \r returns cursor to start of line, allowing countdown on same line
            # -n suppresses the newline that echo would normally add
            echo -ne "Next sequence in $i seconds...\r"
            sleep 1
        done
        # After countdown finished, add a newline and message
        echo -e "\nStarting next sequence"
        
        # Increment the sequence counter
        ((count++))
    done
}

#==============================================================================
# SCRIPT ENTRY POINT
#==============================================================================
# Start waiting for the Xemu window to appear
echo "Waiting for Xemu window to appear... (Ctrl+C to cancel)"
window_id=""  # Initialize empty window ID

# Wait indefinitely until Xemu window appears
while true; do
    # Try to get the window ID
    window_id=$(get_xemu_window)
    # If we found a window, exit the loop
    if [ -n "$window_id" ]; then
        echo "Xemu window found!"
        break
    fi
    # Brief pause before checking again to avoid high CPU usage
    sleep 1
done

# We found the window, but Xemu might need more time to fully initialize
echo "Xemu detected, waiting $XEMU_INIT_WAIT seconds for initialization..."
sleep $XEMU_INIT_WAIT

# Start the main function with the window ID we found
echo "Starting Passleader..."
run_passleader "$window_id" 