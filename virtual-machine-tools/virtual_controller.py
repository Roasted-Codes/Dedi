#!/usr/bin/env python3
"""
Enhanced Virtual USB Controller using evdev
"""

import time
import threading
import sys
from evdev import UInput, ecodes as e

class EnhancedVirtualController:
    """Enhanced virtual controller using evdev"""
    
    def __init__(self, device_name: str = "Virtual Xemu Controller"):
        self.device_name = device_name
        self.uinput = None
        self.running = False
        
        # Define the device capabilities - simplified for just buttons
        self.capabilities = {
            e.EV_KEY: [
                e.BTN_A,      # A button
                e.BTN_B,      # B button  
                e.BTN_X,      # X button
                e.BTN_Y,      # Y button
                e.BTN_START,  # Start button
                e.BTN_SELECT, # Select button
                e.BTN_TL,     # Left trigger
                e.BTN_TR,     # Right trigger
            ]
        }
    
    def start(self):
        """Initialize the virtual controller"""
        try:
            self.uinput = UInput(self.capabilities, name=self.device_name)
            self.running = True
            print(f"Virtual controller '{self.device_name}' created successfully")
            return True
        except Exception as e:
            print(f"Failed to create virtual controller: {e}")
            return False
    
    def press_button(self, button, duration: float = 0.05):
        """Press and release a button"""
        if not self.uinput:
            return
            
        # Press down
        self.uinput.write(e.EV_KEY, button, 1)
        self.uinput.syn()
        
        # Hold for duration
        time.sleep(duration)
        
        # Release
        self.uinput.write(e.EV_KEY, button, 0)
        self.uinput.syn()
        
        print(f"Button {button} pressed for {duration}s")
    
    def ask_permission(self, timeout: int = 30):
        """Ask for permission to start button sequence with timeout"""
        print(f"\nReady to start button press sequence.")
        print(f"Press 'y' or 'Y' to start immediately, or wait {timeout} seconds to auto-start.")
        print("Press 'n' or 'N' to exit.")
        
        # Use threading to handle input with timeout
        user_input = [None]
        
        def get_input():
            try:
                user_input[0] = input("Start sequence? (y/n): ").strip().lower()
            except EOFError:
                user_input[0] = None
        
        input_thread = threading.Thread(target=get_input)
        input_thread.daemon = True
        input_thread.start()
        
        # Wait for input or timeout
        for i in range(timeout, 0, -1):
            if user_input[0] is not None:
                break
            print(f"\rAuto-starting in {i} seconds... (or press y/n)", end='', flush=True)
            time.sleep(1)
        
        print()  # New line after countdown
        
        if user_input[0] is None:
            print("No input received, auto-starting sequence...")
            return True
        elif user_input[0] in ['y', 'yes']:
            print("Starting sequence immediately...")
            return True
        elif user_input[0] in ['n', 'no']:
            print("Sequence cancelled by user.")
            return False
        else:
            print("Invalid input, auto-starting sequence...")
            return True
    
    def run_passleader_sequence(self, sequence_interval: int = 20, wait_between_keys: int = 1):
        """Run the passleader sequence"""
        print("Starting enhanced virtual controller B -> A sequence...")
        print("Press Ctrl+C to stop")
        
        count = 1
        
        while self.running:
            print(f"\nSequence {count}:")
            
            # Press B button
            self.press_button(e.BTN_B)
            
            # Wait between B and A
            print(f"Waiting {wait_between_keys} second(s)...")
            time.sleep(wait_between_keys)
            
            # Press A button
            self.press_button(e.BTN_A)
            
            # Wait for next sequence
            for i in range(sequence_interval, 0, -1):
                print(f"\rNext sequence in {i} seconds...", end='', flush=True)
                time.sleep(1)
            print()
            
            count += 1
    
    def stop(self):
        """Stop the virtual controller"""
        self.running = False
        if self.uinput:
            self.uinput.close()
        print("\nVirtual controller stopped")

def main():
    """Main function for enhanced controller"""
    controller = EnhancedVirtualController()
    
    try:
        if controller.start():
            # Wait for device initialization
            print("Waiting 2 seconds for device initialization...")
            time.sleep(2)
            
            # Ask for permission before starting
            if controller.ask_permission():
                # Run the passleader sequence
                controller.run_passleader_sequence()
            else:
                print("Exiting without starting sequence.")
        else:
            print("Failed to start virtual controller")
            return 1
            
    except KeyboardInterrupt:
        print("\nInterrupted by user")
    finally:
        controller.stop()
    
    return 0

if __name__ == "__main__":
    exit(main())