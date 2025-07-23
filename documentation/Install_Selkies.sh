#!/bin/bash

# Selkies Automated Installation Script
# This script installs and configures Selkies for remote desktop access on a VPS
# Based on the tutorial at: https://selkies-project.github.io/selkies/start/

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Function to check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
        exit 1
    fi
}

# Function to check system requirements
check_requirements() {
    print_status "Checking system requirements..."
    
    # Check if running on Linux
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        print_error "This script is designed for Linux systems only."
        exit 1
    fi
    
    # Check if running on Ubuntu/Debian
    if ! command -v apt &> /dev/null; then
        print_error "This script requires apt package manager (Ubuntu/Debian)."
        exit 1
    fi
    
    # Check available memory (at least 1GB)
    local mem_kb=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
    local mem_gb=$((mem_kb / 1024 / 1024))
    if [[ $mem_gb -lt 1 ]]; then
        print_warning "Low memory detected (${mem_gb}GB). Selkies requires at least 1GB RAM for optimal performance."
    fi
    
    # Check available disk space (at least 5GB)
    local disk_gb=$(df / | awk 'NR==2 {print int($4/1024/1024)}')
    if [[ $disk_gb -lt 5 ]]; then
        print_error "Insufficient disk space. At least 5GB free space required."
        exit 1
    fi
    
    print_success "System requirements check passed"
}

# Function to get user input
get_user_input() {
    echo
    print_status "Please provide the following information:"
    
    # Get username
    read -p "Enter username for Selkies login (default: admin): " SELKIES_USER
    SELKIES_USER=${SELKIES_USER:-admin}
    
    # Get password
    while true; do
        read -s -p "Enter password for Selkies login: " SELKIES_PASSWORD
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
    
    # Get port
    read -p "Enter port for Selkies (default: 8080): " SELKIES_PORT
    SELKIES_PORT=${SELKIES_PORT:-8080}
    
    # Get resolution
    read -p "Enter display resolution (default: 1920x1080): " DISPLAY_RESOLUTION
    DISPLAY_RESOLUTION=${DISPLAY_RESOLUTION:-1920x1080}
    
    # Get encoder
    echo "Select video encoder:"
    echo "1) x264enc (software, good compatibility)"
    echo "2) vp8enc (software, better performance)"
    echo "3) vp9enc (software, best compression)"
    read -p "Enter choice (1-3, default: 1): " ENCODER_CHOICE
    
    case $ENCODER_CHOICE in
        2) SELKIES_ENCODER="vp8enc" ;;
        3) SELKIES_ENCODER="vp9enc" ;;
        *) SELKIES_ENCODER="x264enc" ;;
    esac
    
    # Ask about HTTPS
    read -p "Enable HTTPS? (y/N): " ENABLE_HTTPS
    ENABLE_HTTPS=${ENABLE_HTTPS:-n}
    
    # Ask about firewall
    read -p "Configure firewall to allow port $SELKIES_PORT? (Y/n): " CONFIGURE_FIREWALL
    CONFIGURE_FIREWALL=${CONFIGURE_FIREWALL:-y}
    
    # Ask about auto-start
    read -p "Create systemd service for auto-start? (Y/n): " CREATE_SERVICE
    CREATE_SERVICE=${CREATE_SERVICE:-y}
}

# Function to update system
update_system() {
    print_status "Updating system packages..."
    sudo apt update
    sudo apt upgrade -y
    print_success "System updated"
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing required dependencies..."
    
    sudo apt install --no-install-recommends -y \
        jq \
        tar \
        gzip \
        ca-certificates \
        curl \
        libpulse0 \
        wayland-protocols \
        libwayland-dev \
        libwayland-egl1 \
        x11-utils \
        x11-xkb-utils \
        x11-xserver-utils \
        xserver-xorg-core \
        libx11-xcb1 \
        libxcb-dri3-0 \
        libxkbcommon0 \
        libxdamage1 \
        libxfixes3 \
        libxv1 \
        libxtst6 \
        libxext6 \
        xvfb \
        pulseaudio \
        xfce4 \
        xfce4-goodies \
        screen
    
    print_success "Dependencies installed"
}

# Function to download and install Selkies
install_selkies() {
    print_status "Downloading and installing Selkies..."
    
    # Get the latest version
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

# Function to create startup script
create_startup_script() {
    print_status "Creating startup script..."
    
    cat > ~/start-selkies.sh << EOF
#!/bin/bash

# Selkies Startup Script
# This script starts all required services for Selkies

set -e

# Set environment variables
export DISPLAY=":99"
export PIPEWIRE_LATENCY="128/48000"
export XDG_RUNTIME_DIR="/tmp"
export PIPEWIRE_RUNTIME_DIR="/tmp"
export PULSE_RUNTIME_PATH="/tmp/pulse"
export PULSE_SERVER="unix:/tmp/pulse/native"

# Create necessary directories
mkdir -p /tmp/pulse

# Kill existing processes
pkill -f Xvfb || true
pkill -f pulseaudio || true
pkill -f selkies-gstreamer || true

# Start virtual display server
Xvfb :99 -screen 0 ${DISPLAY_RESOLUTION}x24 +extension "COMPOSITE" +extension "DAMAGE" +extension "GLX" +extension "RANDR" +extension "RENDER" +extension "MIT-SHM" +extension "XFIXES" +extension "XTEST" +iglx +render -nolisten "tcp" -ac -noreset -shmem >/tmp/Xvfb_selkies.log 2>&1 &

# Wait for display server
sleep 2

# Start PulseAudio
pulseaudio --verbose --log-target=file:/tmp/pulseaudio_selkies.log --disallow-exit --exit-idle-time=-1 --file=/etc/pulse/default.pa &

# Wait for audio server
sleep 1

# Start desktop environment
DISPLAY=:99 xfce4-session >/tmp/xfce4_selkies.log 2>&1 &

# Wait for desktop
sleep 3

# Start Selkies
cd ~/selkies-gstreamer
./selkies-gstreamer-run \\
    --addr=0.0.0.0 \\
    --port=${SELKIES_PORT} \\
    --enable_https=${ENABLE_HTTPS} \\
    --basic_auth_user=${SELKIES_USER} \\
    --basic_auth_password=${SELKIES_PASSWORD} \\
    --encoder=${SELKIES_ENCODER} \\
    --enable_resize=true

EOF
    
    chmod +x ~/start-selkies.sh
    print_success "Startup script created: ~/start-selkies.sh"
}

# Function to create systemd service
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
WorkingDirectory=$HOME
ExecStart=$HOME/start-selkies.sh
Restart=always
RestartSec=10
Environment=DISPLAY=:99
Environment=XDG_RUNTIME_DIR=/tmp
Environment=PULSE_RUNTIME_PATH=/tmp/pulse

[Install]
WantedBy=multi-user.target
EOF
        
        sudo systemctl daemon-reload
        sudo systemctl enable selkies.service
        
        print_success "Systemd service created and enabled"
        print_status "To start the service: sudo systemctl start selkies"
        print_status "To check status: sudo systemctl status selkies"
    fi
}

# Function to configure firewall
configure_firewall() {
    if [[ "$CONFIGURE_FIREWALL" == "y" || "$CONFIGURE_FIREWALL" == "Y" ]]; then
        print_status "Configuring firewall..."
        
        # Check if UFW is active
        if sudo ufw status | grep -q "Status: active"; then
            sudo ufw allow $SELKIES_PORT/tcp
            print_success "Firewall rule added for port $SELKIES_PORT"
        else
            print_warning "UFW is not active. Please manually configure your firewall to allow port $SELKIES_PORT"
        fi
    fi
}

# Function to create stop script
create_stop_script() {
    print_status "Creating stop script..."
    
    cat > ~/stop-selkies.sh << 'EOF'
#!/bin/bash

# Selkies Stop Script

echo "Stopping Selkies services..."

# Stop systemd service if running
sudo systemctl stop selkies.service 2>/dev/null || true

# Kill processes
pkill -f selkies-gstreamer || true
pkill -f xfce4-session || true
pkill -f pulseaudio || true
pkill -f Xvfb || true

echo "Selkies services stopped"
EOF
    
    chmod +x ~/stop-selkies.sh
    print_success "Stop script created: ~/stop-selkies.sh"
}

# Function to display final information
display_final_info() {
    echo
    print_success "Selkies installation completed!"
    echo
    echo "=== Connection Information ==="
    echo "URL: http://$(curl -s ifconfig.me):$SELKIES_PORT"
    echo "Username: $SELKIES_USER"
    echo "Password: [the password you entered]"
    echo
    echo "=== Management Commands ==="
    echo "Start Selkies: ~/start-selkies.sh"
    echo "Stop Selkies: ~/stop-selkies.sh"
    if [[ "$CREATE_SERVICE" == "y" || "$CREATE_SERVICE" == "Y" ]]; then
        echo "Start service: sudo systemctl start selkies"
        echo "Stop service: sudo systemctl stop selkies"
        echo "Check status: sudo systemctl status selkies"
    fi
    echo
    echo "=== Log Files ==="
    echo "Xvfb logs: /tmp/Xvfb_selkies.log"
    echo "Audio logs: /tmp/pulseaudio_selkies.log"
    echo "Desktop logs: /tmp/xfce4_selkies.log"
    echo
    print_warning "Make sure port $SELKIES_PORT is open in your VPS provider's firewall"
    echo
    print_status "Starting Selkies now..."
    echo
}

# Function to start Selkies
start_selkies() {
    read -p "Start Selkies now? (Y/n): " START_NOW
    START_NOW=${START_NOW:-y}
    
    if [[ "$START_NOW" == "y" || "$START_NOW" == "Y" ]]; then
        print_status "Starting Selkies services..."
        ~/start-selkies.sh &
        sleep 5
        print_success "Selkies should now be running!"
        print_status "Check the logs if you encounter any issues"
    fi
}

# Main installation function
main() {
    echo "=========================================="
    echo "    Selkies Automated Installation"
    echo "=========================================="
    echo
    
    check_root
    check_requirements
    get_user_input
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
