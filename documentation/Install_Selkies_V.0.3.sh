#!/bin/bash

# Selkies Automated Installation Script V0.2 Clean
# Simple, reliable installation for remote desktop access
# Tested and optimized for sharing with friends

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Simple output functions
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo "=========================================="
    echo "    Selkies V0.2 Clean Installation"
    echo "=========================================="
    echo
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
        exit 1
    fi
}

# Simple desktop detection
detect_desktop() {
    print_status "Detecting desktop environment..."
    
    if pgrep -x "plasmashell" > /dev/null; then
        DESKTOP_ENV="plasma"
        print_success "Detected Plasma (KDE) desktop"
    elif pgrep -x "gnome-shell" > /dev/null; then
        DESKTOP_ENV="gnome"
        print_success "Detected GNOME desktop"
    elif pgrep -x "xfce4-session" > /dev/null; then
        DESKTOP_ENV="xfce"
        print_success "Detected XFCE desktop"
    else
        DESKTOP_ENV="none"
        print_status "No desktop environment detected - will create virtual desktop"
    fi
}

# Clean up existing installations
cleanup_existing() {
    print_status "Cleaning up existing installations..."
    
    sudo systemctl stop selkies.service 2>/dev/null || true
    pkill -f selkies-gstreamer || true
    pkill -f xfce4-session || true
    pkill -f pulseaudio || true
    pkill -f Xvfb || true
    sleep 2
    
    sudo rm -f /tmp/*_selkies.log 2>/dev/null || true
    rm -rf ~/.selkies 2>/dev/null || true
    
    print_success "Cleanup completed"
}

# Check system requirements
check_requirements() {
    print_status "Checking system requirements..."
    
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        print_error "This script is designed for Linux systems only."
        exit 1
    fi
    
    if ! command -v apt &> /dev/null; then
        print_error "This script requires apt package manager (Ubuntu/Debian)."
        exit 1
    fi
    
    # Check memory (at least 1GB)
    local mem_gb=$(grep MemAvailable /proc/meminfo | awk '{print int($2/1024/1024)}')
    if [[ $mem_gb -lt 1 ]]; then
        print_warning "Low memory detected (${mem_gb}GB). At least 1GB RAM recommended."
    fi
    
    # Check disk space (at least 5GB)
    local disk_gb=$(df / | awk 'NR==2 {print int($4/1024/1024)}')
    if [[ $disk_gb -lt 5 ]]; then
        print_error "Insufficient disk space. At least 5GB free space required."
        exit 1
    fi
    
    print_success "System requirements check passed"
}

# Get user configuration
get_user_config() {
    echo
    print_status "Configuration:"
    
    # Username
    read -p "Username for Selkies login (default: admin): " SELKIES_USER
    SELKIES_USER=${SELKIES_USER:-admin}
    
    # Password
    while true; do
        read -s -p "Password for Selkies login: " SELKIES_PASSWORD
        echo
        if [[ -z "$SELKIES_PASSWORD" ]]; then
            print_error "Password cannot be empty"
            continue
        fi
        
        read -s -p "Confirm password: " SELKIES_PASSWORD_CONFIRM
        echo
        
        if [[ "$SELKIES_PASSWORD" == "$SELKIES_PASSWORD_CONFIRM" ]]; then
            break
        else
            print_error "Passwords do not match"
        fi
    done
    
    # Port
    read -p "Port for Selkies (default: 8080): " SELKIES_PORT
    SELKIES_PORT=${SELKIES_PORT:-8080}
    
    # Resolution (only if no desktop detected)
    if [[ "$DESKTOP_ENV" == "none" ]]; then
        read -p "Display resolution (default: 1920x1080): " DISPLAY_RESOLUTION
        DISPLAY_RESOLUTION=${DISPLAY_RESOLUTION:-1920x1080}
    fi
    
    # Encoder
    echo "Video encoder:"
    echo "1) x264enc (good compatibility)"
    echo "2) vp8enc (better performance)"
    read -p "Choice (1-2, default: 1): " ENCODER_CHOICE
    case $ENCODER_CHOICE in
        2) SELKIES_ENCODER="vp8enc" ;;
        *) SELKIES_ENCODER="x264enc" ;;
    esac
    
    # Resize behavior
    echo "Resize behavior:"
    echo "1) Disable resize (recommended for existing desktops)"
    echo "2) Enable resize (for virtual desktops only)"
    read -p "Choice (1-2, default: 1): " RESIZE_CHOICE
    case $RESIZE_CHOICE in
        2) ENABLE_RESIZE="true" ;;
        *) ENABLE_RESIZE="false" ;;
    esac
    
    # HTTPS
    read -p "Enable HTTPS? (y/N): " ENABLE_HTTPS
    ENABLE_HTTPS=${ENABLE_HTTPS:-n}
    
    # Firewall
    read -p "Configure firewall for port $SELKIES_PORT? (Y/n): " CONFIGURE_FIREWALL
    CONFIGURE_FIREWALL=${CONFIGURE_FIREWALL:-y}
    
    # Auto-start
    read -p "Create systemd service for auto-start? (Y/n): " CREATE_SERVICE
    CREATE_SERVICE=${CREATE_SERVICE:-y}
}

# Update system
update_system() {
    print_status "Updating system packages..."
    sudo apt update
    sudo apt upgrade -y
    print_success "System updated"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Core dependencies
    sudo apt install --no-install-recommends -y \
        jq curl tar gzip ca-certificates \
        libpulse0 pulseaudio xvfb screen
    
    # X11 dependencies
    sudo apt install --no-install-recommends -y \
        x11-utils x11-xkb-utils x11-xserver-utils \
        xserver-xorg-core libx11-xcb1 libxcb-dri3-0 \
        libxkbcommon0 libxdamage1 libxfixes3 libxv1 libxtst6 libxext6
    
    # Install desktop environment if needed
    if [[ "$DESKTOP_ENV" == "none" ]]; then
        print_status "Installing XFCE desktop environment..."
        sudo apt install --no-install-recommends -y xfce4 xfce4-goodies
    fi
    
    print_success "Dependencies installed"
}

# Download and install Selkies
install_selkies() {
    print_status "Downloading Selkies..."
    
    # Get latest version
    SELKIES_VERSION=$(curl -fsSL "https://api.github.com/repos/selkies-project/selkies/releases/latest" | jq -r '.tag_name' | sed 's/[^0-9\.\-]*//g')
    
    if [[ -z "$SELKIES_VERSION" ]]; then
        print_error "Failed to get Selkies version"
        exit 1
    fi
    
    print_status "Latest version: $SELKIES_VERSION"
    
    # Download and extract
    cd ~
    curl -fsSL "https://github.com/selkies-project/selkies/releases/download/v${SELKIES_VERSION}/selkies-gstreamer-portable-v${SELKIES_VERSION}_amd64.tar.gz" | tar -xzf -
    
    if [[ ! -d "selkies-gstreamer" ]]; then
        print_error "Failed to extract Selkies"
        exit 1
    fi
    
    print_success "Selkies downloaded and extracted"
}

# Create startup script
create_startup_script() {
    print_status "Creating startup script..."
    
    # Create directories
    mkdir -p ~/.selkies/logs ~/.selkies/runtime/pulse
    chmod 700 ~/.selkies ~/.selkies/logs ~/.selkies/runtime
    
    cat > ~/start-selkies.sh << EOF
#!/bin/bash

# Selkies Startup Script
set -e

# Environment variables
export DISPLAY=":99"
export XDG_RUNTIME_DIR="\$HOME/.selkies/runtime"
export PULSE_RUNTIME_PATH="\$HOME/.selkies/runtime/pulse"
export PULSE_SERVER="unix:\$HOME/.selkies/runtime/pulse/native"

# Kill existing processes
pkill -f selkies-gstreamer || true
pkill -f xfce4-session || true
pkill -f pulseaudio || true
pkill -f Xvfb || true
sleep 2

EOF

    # Add desktop-specific startup
    if [[ "$DESKTOP_ENV" == "none" ]]; then
        cat >> ~/start-selkies.sh << EOF
# Start virtual display
Xvfb :99 -screen 0 ${DISPLAY_RESOLUTION}x24 +extension "COMPOSITE" +extension "DAMAGE" +extension "GLX" +extension "RANDR" +extension "RENDER" +extension "MIT-SHM" +extension "XFIXES" +extension "XTEST" +iglx +render -nolisten "tcp" -ac -noreset -shmem >"\$HOME/.selkies/logs/Xvfb_selkies.log" 2>&1 &
sleep 3

# Start audio
pulseaudio --verbose --log-target=file:"\$HOME/.selkies/logs/pulseaudio_selkies.log" --disallow-exit --exit-idle-time=-1 --file=/etc/pulse/default.pa --runtime-dir="\$HOME/.selkies/runtime/pulse" &
sleep 2

# Start desktop
DISPLAY=:99 xfce4-session >"\$HOME/.selkies/logs/xfce4_selkies.log" 2>&1 &
sleep 5

EOF
    else
        cat >> ~/start-selkies.sh << EOF
# Using existing desktop environment
if [[ -z "\$DISPLAY" ]]; then
    # Try to find existing display
    for i in {0..9}; do
        if xdpyinfo -display ":\$i" >/dev/null 2>&1; then
            export DISPLAY=":\$i"
            break
        fi
    done
fi

EOF
    fi

    # Add Selkies startup
    cat >> ~/start-selkies.sh << EOF

# Start Selkies
cd ~/selkies-gstreamer
./selkies-gstreamer-run \\
    --addr=0.0.0.0 \\
    --port=${SELKIES_PORT} \\
    --enable_https=${ENABLE_HTTPS} \\
    --basic_auth_user=${SELKIES_USER} \\
    --basic_auth_password=${SELKIES_PASSWORD} \\
    --encoder=${SELKIES_ENCODER} \\
    --enable_resize=${ENABLE_RESIZE}

EOF
    
    chmod +x ~/start-selkies.sh
    print_success "Startup script created: ~/start-selkies.sh"
}

# Create systemd service
create_systemd_service() {
    if [[ "$CREATE_SERVICE" == "y" || "$CREATE_SERVICE" == "Y" ]]; then
        print_status "Creating systemd service..."
        
        sudo tee /etc/systemd/system/selkies.service > /dev/null << EOF
[Unit]
Description=Selkies Remote Desktop
After=network.target

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$HOME
ExecStart=$HOME/start-selkies.sh
Restart=always
RestartSec=10
Environment=XDG_RUNTIME_DIR=$HOME/.selkies/runtime
Environment=PULSE_RUNTIME_PATH=$HOME/.selkies/runtime/pulse
Environment=PULSE_SERVER=unix:$HOME/.selkies/runtime/pulse/native
Environment=HOME=$HOME
StandardOutput=journal
StandardError=journal
TimeoutStartSec=60
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF
        
        sudo systemctl daemon-reload
        sudo systemctl enable selkies.service
        print_success "Systemd service created and enabled"
    fi
}

# Configure firewall
configure_firewall() {
    if [[ "$CONFIGURE_FIREWALL" == "y" || "$CONFIGURE_FIREWALL" == "Y" ]]; then
        print_status "Configuring firewall..."
        
        if sudo ufw status | grep -q "Status: active"; then
            sudo ufw allow $SELKIES_PORT/tcp
            print_success "Firewall rule added for port $SELKIES_PORT"
        else
            print_warning "UFW is not active. Please manually configure your firewall to allow port $SELKIES_PORT"
        fi
    fi
}

# Create stop script
create_stop_script() {
    print_status "Creating stop script..."
    
    cat > ~/stop-selkies.sh << 'EOF'
#!/bin/bash

echo "Stopping Selkies services..."

sudo systemctl stop selkies.service 2>/dev/null || true
pkill -f selkies-gstreamer || true
pkill -f xfce4-session || true
pkill -f pulseaudio || true
pkill -f Xvfb || true

sleep 2
rm -rf ~/.selkies/runtime/pulse 2>/dev/null || true

echo "Selkies services stopped"
EOF
    
    chmod +x ~/stop-selkies.sh
    print_success "Stop script created: ~/stop-selkies.sh"
}

# Display final information
display_final_info() {
    echo
    print_success "Selkies installation completed!"
    echo
    echo "=== Connection Information ==="
    
    # Get IP with fallback
    PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || curl -s --max-time 5 ipinfo.io/ip 2>/dev/null || echo "YOUR_SERVER_IP")
    echo "URL: http://${PUBLIC_IP}:$SELKIES_PORT"
    echo "Username: $SELKIES_USER"
    echo "Password: [the password you entered]"
    echo
    echo "=== Management Commands ==="
    echo "Start: ~/start-selkies.sh"
    echo "Stop: ~/stop-selkies.sh"
    if [[ "$CREATE_SERVICE" == "y" || "$CREATE_SERVICE" == "Y" ]]; then
        echo "Service start: sudo systemctl start selkies"
        echo "Service status: sudo systemctl status selkies"
    fi
    echo
    echo "=== Log Files ==="
    echo "Xvfb: ~/.selkies/logs/Xvfb_selkies.log"
    echo "Audio: ~/.selkies/logs/pulseaudio_selkies.log"
    echo "Desktop: ~/.selkies/logs/xfce4_selkies.log"
    echo
    print_warning "Make sure port $SELKIES_PORT is open in your VPS provider's firewall"
    echo
}

# Start Selkies
start_selkies() {
    read -p "Start Selkies now? (Y/n): " START_NOW
    START_NOW=${START_NOW:-y}
    
    if [[ "$START_NOW" == "y" || "$START_NOW" == "Y" ]]; then
        print_status "Starting Selkies..."
        ~/start-selkies.sh &
        sleep 3
        print_success "Selkies should now be running!"
    fi
}

# Main installation function
main() {
    print_header
    
    check_root
    cleanup_existing
    check_requirements
    detect_desktop
    get_user_config
    update_system
    install_dependencies
    install_selkies
    create_startup_script
    create_systemd_service
    configure_firewall
    create_stop_script
    display_final_info
    start_selkies
    
    echo
    print_success "Installation completed successfully!"
    echo "You can now access your remote desktop through your web browser."
}

# Run main function
main "$@" 