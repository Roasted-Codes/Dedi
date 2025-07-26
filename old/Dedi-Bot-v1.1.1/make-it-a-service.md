# Setting up a Node.js Application as a Systemd Service

This guide explains how to set up a Node.js application to run automatically on system startup using systemd on Linux.

## 1. Create the Service File

Create a new file named `dedi-bot.service` with the following content:

```ini
[Unit]
Description=Dedi Discord Bot
After=network.target

[Service]
Type=simple
User=bot
WorkingDirectory=/home/bot/Dedi/dedi-bot-simple
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=dedi-bot

[Install]
WantedBy=multi-user.target
```

### Understanding the Service File

- `Description`: A human-readable description of the service
- `After`: Ensures the service starts after the network is available
- `Type`: Specifies how systemd should consider the service started
- `User`: The user account under which the service will run
- `WorkingDirectory`: The directory where your Node.js application is located
- `ExecStart`: The command to start your application
- `Restart`: Automatically restart the service if it fails
- `RestartSec`: How long to wait before attempting a restart
- `StandardOutput/StandardError`: Where to send output and error logs
- `SyslogIdentifier`: Identifier for log entries
- `WantedBy`: When the service should be started

## 2. Install and Enable the Service

Run these commands in order:

1. Move the service file to the systemd directory:
```bash
sudo mv dedi-bot.service /etc/systemd/system/
```

2. Reload the systemd daemon to recognize the new service:
```bash
sudo systemctl daemon-reload
```

3. Enable the service to start on boot:
```bash
sudo systemctl enable dedi-bot
```

4. Start the service immediately:
```bash
sudo systemctl start dedi-bot
```

## 3. Managing the Service

### Check Service Status
```bash
sudo systemctl status dedi-bot
```

### View Service Logs
```bash
sudo journalctl -u dedi-bot -f
```

### Common Service Commands

- Stop the service:
```bash
sudo systemctl stop dedi-bot
```

- Restart the service:
```bash
sudo systemctl restart dedi-bot
```

- Disable autostart:
```bash
sudo systemctl disable dedi-bot
```

## 4. Troubleshooting

If the service fails to start:

1. Check the logs:
```bash
sudo journalctl -u dedi-bot -e
```

2. Verify file permissions:
```bash
ls -l /home/bot/Dedi/dedi-bot-simple/index.js
```

3. Ensure Node.js is installed and accessible:
```bash
which node
node --version
```

4. Check if the working directory exists and is accessible:
```bash
ls -l /home/bot/Dedi/dedi-bot-simple
```

## 5. Important Notes

- Make sure your application handles crashes gracefully
- Keep your .env file in the working directory
- Ensure all required dependencies are installed
- The service user (bot) must have proper permissions
- Consider using absolute paths for any file operations in your code

## 6. Customization

To modify the service configuration:

1. Edit the service file:
```bash
sudo nano /etc/systemd/system/dedi-bot.service
```

2. After any changes, reload the daemon and restart the service:
```bash
sudo systemctl daemon-reload
sudo systemctl restart dedi-bot
```
```

This markdown file provides a complete, step-by-step guide that you can follow to set up any Node.js application as a systemd service. It includes all the necessary commands, explanations of what each part does, and troubleshooting steps if something goes wrong.

You can create this file using your preferred text editor (like nano, vim, or through your IDE) and save it as `make-it-a-service.md` in your project directory.