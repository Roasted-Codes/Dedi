# Selkies Tutorial: Setting Up a Remote Desktop on Your VPS

## What is Selkies?

Selkies is a powerful tool that lets you access a full Linux desktop environment through your web browser. Think of it like TeamViewer or AnyDesk, but running on your own server. This is perfect for:

- Accessing your VPS with a full graphical interface
- Running GUI applications remotely
- Creating a personal cloud desktop
- Learning Linux with a visual interface

## Prerequisites

Before we start, make sure you have:
- A VPS running Ubuntu 20.04 or newer (or Debian-based Linux)
- SSH access to your VPS
- At least 2GB RAM and 10GB storage
- A modern web browser (Chrome, Firefox, Safari, Edge)

## Quick Installation (Recommended)

We've created an automated installation script that handles everything for you. This is the easiest way to get started!

### Step 1: Download the Installation Script

First, download the installation script to your local computer:

```bash
# If you have the script locally, upload it to your VPS
scp Install_Selkies.sh username@your-vps-ip:~/
```

Replace `username` with your actual username and `your-vps-ip` with your VPS's IP address.

### Step 2: Connect to Your VPS

Connect to your VPS via SSH:

```bash
ssh username@your-vps-ip
```

### Step 3: Run the Installation Script

Make the script executable and run it:

```bash
chmod +x Install_Selkies.sh
./Install_Selkies.sh
```

### Step 4: Follow the Setup Wizard

The script will guide you through a simple setup process:

1. **Username**: Enter a username for logging into Selkies (default: admin)
2. **Password**: Create a strong password (you'll need to confirm it)
3. **Port**: Choose which port to use (default: 8080)
4. **Resolution**: Set your display resolution (default: 1920x1080)
5. **Video Encoder**: Choose your preferred encoder:
   - `x264enc` (recommended for compatibility)
   - `vp8enc` (better performance)
   - `vp9enc` (best compression)
6. **HTTPS**: Choose whether to enable HTTPS (recommended for production)
7. **Firewall**: Let the script configure your firewall automatically
8. **Auto-start**: Create a systemd service for automatic startup

### Step 5: Access Your Remote Desktop

Once installation is complete, you can access your remote desktop:

1. Open your web browser
2. Go to: `http://your-vps-ip:8080`
3. Enter your username and password
4. Click "Connect" to start your remote desktop session

## What the Script Does Automatically

The installation script handles all the complex setup for you:

✅ **System Updates**: Updates all packages to the latest versions
✅ **Dependencies**: Installs all required system packages
✅ **Selkies Download**: Downloads and extracts the latest version
✅ **Virtual Display**: Sets up Xvfb for headless server operation
✅ **Audio Support**: Configures PulseAudio for audio streaming
✅ **Desktop Environment**: Installs and configures Xfce4
✅ **Management Scripts**: Creates start/stop scripts
✅ **Systemd Service**: Optional auto-start on boot
✅ **Firewall Configuration**: Opens the required port
✅ **Security Setup**: Proper user permissions and service configuration

## Managing Your Selkies Installation

### Starting Selkies

```bash
# Manual start
~/start-selkies.sh

# Or if you enabled the systemd service
sudo systemctl start selkies
```

### Stopping Selkies

```bash
# Manual stop
~/stop-selkies.sh

# Or if using systemd service
sudo systemctl stop selkies
```

### Checking Status

```bash
# Check if the service is running
sudo systemctl status selkies

# Check if the port is listening
netstat -tlnp | grep 8080
```

### Viewing Logs

```bash
# Virtual display logs
tail -f /tmp/Xvfb_selkies.log

# Audio service logs
tail -f /tmp/pulseaudio_selkies.log

# Desktop environment logs
tail -f /tmp/xfce4_selkies.log
```

## Troubleshooting

### Connection Issues

**Problem**: Can't connect to the remote desktop

**Solutions**:
1. **Check if Selkies is running**:
   ```bash
   ps aux | grep selkies
   ```

2. **Verify the port is open**:
   ```bash
   netstat -tlnp | grep 8080
   ```

3. **Check your VPS provider's firewall**:
   - Make sure port 8080 (or your chosen port) is open
   - Check your VPS control panel for firewall settings

4. **Check UFW firewall**:
   ```bash
   sudo ufw status
   sudo ufw allow 8080/tcp  # if needed
   ```

### Black Screen Issues

**Problem**: Remote desktop shows a black screen

**Solutions**:
1. **Restart the virtual display**:
   ```bash
   pkill -f Xvfb
   ~/start-selkies.sh
   ```

2. **Check display logs**:
   ```bash
   tail -f /tmp/Xvfb_selkies.log
   ```

### Audio Issues

**Problem**: No audio in the remote desktop

**Solutions**:
1. **Check if PulseAudio is running**:
   ```bash
   ps aux | grep pulseaudio
   ```

2. **Restart audio services**:
   ```bash
   pkill -f pulseaudio
   ~/start-selkies.sh
   ```

3. **Note**: Some browsers require HTTPS for audio to work

### Performance Issues

**Problem**: Remote desktop is slow or laggy

**Solutions**:
1. **Lower the resolution**:
   Edit `~/start-selkies.sh` and change the resolution (e.g., 1280x720)

2. **Try a different encoder**:
   - `vp8enc` for better performance
   - `vp9enc` for better compression

3. **Close unnecessary applications** in the remote desktop

4. **Check system resources**:
   ```bash
   htop
   free -h
   df -h
   ```

## Security Best Practices

### 1. Use HTTPS in Production

For production use, enable HTTPS:

```bash
# Generate SSL certificates (example with Let's Encrypt)
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com

# Then edit ~/start-selkies.sh and change:
# --enable_https=false to --enable_https=true
# Add your certificate paths
```

### 2. Change Default Credentials

Always change the default username and password immediately after installation.

### 3. Use a Reverse Proxy

For additional security, consider using Nginx as a reverse proxy:

```bash
sudo apt install nginx
# Configure Nginx to proxy requests to localhost:8080
```

### 4. Restrict Access

Consider using a VPN or IP whitelist to restrict access to your VPS.

## Advanced Configuration

### Custom Resolution

To change the resolution after installation:

1. Edit `~/start-selkies.sh`
2. Find the line with `Xvfb :99 -screen 0`
3. Change the resolution (e.g., `1920x1080x24` to `1280x720x24`)
4. Restart Selkies

### Different Encoders

To change the video encoder:

1. Edit `~/start-selkies.sh`
2. Find the line with `--encoder=`
3. Change to your preferred encoder:
   - `x264enc` (software, good compatibility)
   - `vp8enc` (software, better performance)
   - `vp9enc` (software, best compression)
4. Restart Selkies

### Custom Port

To change the port:

1. Edit `~/start-selkies.sh`
2. Change `--port=8080` to your desired port
3. Update your firewall: `sudo ufw allow YOUR_PORT/tcp`
4. Restart Selkies

## Uninstalling Selkies

If you need to remove Selkies:

```bash
# Stop all services
~/stop-selkies.sh

# Remove systemd service
sudo systemctl stop selkies
sudo systemctl disable selkies
sudo rm /etc/systemd/system/selkies.service
sudo systemctl daemon-reload

# Remove files
rm -rf ~/selkies-gstreamer
rm ~/start-selkies.sh
rm ~/stop-selkies.sh

# Remove firewall rule (if you know the port)
sudo ufw delete allow 8080/tcp
```

## Next Steps

Once you have Selkies running, you can:

- **Install Additional Software**: Use the remote desktop to install applications
- **Configure Auto-Start**: The systemd service will start Selkies on boot
- **Set Up Multiple Users**: Configure additional user accounts
- **Optimize Performance**: Adjust settings based on your VPS resources
- **Add SSL Certificate**: Enable HTTPS for secure connections

## Support

If you encounter issues:

1. **Check the logs** (see "Viewing Logs" section above)
2. **Restart the services**: `~/stop-selkies.sh && ~/start-selkies.sh`
3. **Verify system requirements**: Ensure you have enough RAM and disk space
4. **Check network connectivity**: Ensure your VPS can reach the internet

---

**Congratulations!** You now have a fully functional remote desktop running on your VPS that you can access from anywhere with a web browser. The automated installation script has handled all the complex setup, so you can focus on using your new remote desktop environment.
