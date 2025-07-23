#!/usr/bin/env python3
import socket
import json
import time
import sys
import logging
import argparse

# Set up logging
logging.basicConfig(level=logging.DEBUG,
                   format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def send_qmp_command(sock, command):
    try:
        # Log the command we're about to send
        logger.debug(f"Sending command: {json.dumps(command, indent=2)}")
        
        # Send the command
        sock.sendall(json.dumps(command).encode() + b'\n')
        
        # Get the response
        response = b''
        while True:
            chunk = sock.recv(1024)
            if not chunk:
                break
            response += chunk
            try:
                # Try to parse as JSON to see if we have a complete message
                json.loads(response.decode())
                break
            except json.JSONDecodeError:
                continue
        
        response_str = response.decode()
        logger.debug(f"Raw response: {response_str}")
        
        # Try to parse the response as JSON for better logging
        try:
            response_json = json.loads(response_str)
            logger.debug(f"Parsed response: {json.dumps(response_json, indent=2)}")
        except json.JSONDecodeError:
            logger.warning("Could not parse response as JSON")
        
        return response_str
    except Exception as e:
        logger.error(f"Error sending command: {e}", exc_info=True)
        return None

def connect_to_qmp():
    try:
        # Create a socket connection
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(('localhost', 4444))
        logger.info("Connected to QMP server")

        # Read the greeting
        greeting = b''
        while True:
            chunk = s.recv(1024)
            if not chunk:
                break
            greeting += chunk
            try:
                json.loads(greeting.decode())
                break
            except json.JSONDecodeError:
                continue
        
        greeting_str = greeting.decode()
        logger.info(f"Received greeting: {greeting_str}")
        
        # Parse greeting to check QEMU version
        try:
            greeting_json = json.loads(greeting_str)
            version = greeting_json.get('QMP', {}).get('version', {})
            logger.info(f"QEMU version: {version.get('major')}.{version.get('minor')}.{version.get('micro')}")
        except json.JSONDecodeError:
            logger.warning("Could not parse greeting as JSON")

        # Send capabilities negotiation
        logger.info("Negotiating capabilities...")
        response = send_qmp_command(s, {"execute": "qmp_capabilities"})
        if not response:
            logger.error("Failed to negotiate capabilities")
            return None

        return s
    except ConnectionRefusedError:
        logger.error("Could not connect to xemu. Make sure xemu is running with QMP enabled.")
        logger.info("Start xemu with: open xemu.app --args -qmp tcp:localhost:4444,server,nowait")
        return None
    except Exception as e:
        logger.error(f"An error occurred: {e}", exc_info=True)
        return None

def main():
    parser = argparse.ArgumentParser(description='Control xemu via QMP')
    parser.add_argument('--stop', action='store_true', help='Pause the emulator')
    parser.add_argument('--cont', action='store_true', help='Resume the emulator')
    parser.add_argument('--status', action='store_true', help='Get emulator status')
    parser.add_argument('--button', action='store_true', help='Send A button press')
    args = parser.parse_args()

    # Connect to QMP
    s = connect_to_qmp()
    if not s:
        sys.exit(1)

    try:
        # Get status if requested
        if args.status:
            logger.info("Getting emulator status...")
            response = send_qmp_command(s, {"execute": "query-status"})
            if not response:
                logger.error("Failed to get status")
                return

        # Stop if requested
        if args.stop:
            logger.info("Pausing emulator...")
            response = send_qmp_command(s, {"execute": "stop"})
            if not response:
                logger.error("Failed to pause emulator")
                return

        # Continue if requested
        if args.cont:
            logger.info("Resuming emulator...")
            response = send_qmp_command(s, {"execute": "cont"})
            if not response:
                logger.error("Failed to resume emulator")
                return

        # Send button press if requested
        if args.button:
            logger.info("Sending A button press...")
            # First, get the device list to find the correct device name
            response = send_qmp_command(s, {"execute": "query-chardev"})
            if not response:
                logger.error("Failed to get device list")
                return
            
            # Send the A button press using the USB XID interface
            response = send_qmp_command(s, {
                "execute": "input-send-event",
                "arguments": {
                    "device": "usb-xbox-gamepad",
                    "events": [{
                        "type": "btn",
                        "data": {
                            "button": "0",  # A button code from xid.h
                            "down": True
                        }
                    }]
                }
            })
            if not response:
                logger.error("Failed to send button press")
                return

            # Wait a bit
            time.sleep(0.1)

            # Send button release
            logger.info("Sending A button release...")
            response = send_qmp_command(s, {
                "execute": "input-send-event",
                "arguments": {
                    "device": "usb-xbox-gamepad",
                    "events": [{
                        "type": "btn",
                        "data": {
                            "button": "0",  # A button code from xid.h
                            "down": False
                        }
                    }]
                }
            })
            if not response:
                logger.error("Failed to send button release")
                return

        # Close the connection
        s.close()
        logger.info("Command sent successfully")

    except Exception as e:
        logger.error(f"An error occurred: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
