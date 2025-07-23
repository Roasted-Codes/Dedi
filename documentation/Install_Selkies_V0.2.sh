#!/bin/bash

# Selkies Automated Installation Script V0.2
# This script intelligently detects your existing setup and configures Selkies accordingly
# Based on the docker-selkies-egl-desktop approach for better compatibility

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

print_question() {
    echo -e "${PURPLE}[QUESTION]${NC} $1"
}

print_header() {
    echo -e "${CYAN}==========================================${NC}"
    echo -e "${CYAN}    Selkies V0.2 Smart Installation${NC}"
    echo -e "${CYAN}==========================================${NC}"
    echo
}

# Function to check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
        exit 1
    fi
}

# Function to detect existing desktop environment
detect_desktop_environment() {
    print_status "Detecting existing desktop environment..."
    
    # Check for running desktop environments
    if pgrep -x "plasmashell" > /dev/null; then
        DESKTOP_ENV="plasma"
        DESKTOP_RUNNING=true
        print_success "Detected running Plasma (KDE) desktop environment"
    elif pgrep -x "gnome-shell" > /dev/null; then
        DESKTOP_ENV="gnome"
        DESKTOP_RUNNING=true
        print_success "Detected running GNOME desktop environment"
    elif pgrep -x "xfce4-session" > /dev/null; then
        DESKTOP_ENV="xfce"
        DESKTOP_RUNNING=true
        print_success "Detected running XFCE desktop environment"
    elif pgrep -x "mate-session" > /dev/null; then
        DESKTOP_ENV="mate"
        DESKTOP_RUNNING=true
        print_success "Detected running MATE desktop environment"
    elif pgrep -x "cinnamon-session" > /dev/null; then
        DESKTOP_ENV="cinnamon"
        DESKTOP_RUNNING=true
        print_success "Detected running Cinnamon desktop environment"
    else
        DESKTOP_RUNNING=false
        print_status "No running desktop environment detected"
        
        # Check for installed desktop environments
        if command -v plasmashell &> /dev/null; then
            DESKTOP_ENV="plasma"
            print_status "Found installed Plasma (KDE) - not currently running"
        elif command -v gnome-shell &> /dev/null; then
            DESKTOP_ENV="gnome"
            print_status "Found installed GNOME - not currently running"
        elif command -v xfce4-session &> /dev/null; then
            DESKTOP_ENV="xfce"
            print_status "Found installed XFCE - not currently running"
        elif command -v mate-session &> /dev/null; then
            DESKTOP_ENV="mate"
            print_status "Found installed MATE - not currently running"
        elif command -v cinnamon-session &> /dev/null; then
            DESKTOP_ENV="cinnamon"
            print_status "Found installed Cinnamon - not currently running"
        else
            DESKTOP_ENV="none"
            print_status "No desktop environment found installed"
        fi
    fi
}

# Function to detect VNC processes
detect_vnc_processes() {
    print_status "Detecting VNC processes..."
    
    VNC_PROCESSES=()
    
    # Check for common VNC servers
    if pgrep -f "vncserver" > /dev/null; then
        VNC_PROCESSES+=("vncserver")
        print_status "Found running VNC server"
    fi
    
    if pgrep -f "x11vnc" > /dev/null; then
        VNC_PROCESSES+=("x11vnc")
        print_status "Found running x11vnc"
    fi
    
    if pgrep -f "tigervnc" > /dev/null; then
        VNC_PROCESSES+=("tigervnc")
        print_status "Found running TigerVNC"
    fi
    
    if pgrep -f "tightvnc" > /dev/null; then
        VNC_PROCESSES+=("tightvnc")
        print_status "Found running TightVNC"
    fi
    
    if [[ ${#VNC_PROCESSES[@]} -eq 0 ]]; then
        print_status "No VNC processes detected"
    else
        print_warning "Found ${#VNC_PROCESSES[@]} VNC process(es): ${VNC_PROCESSES[*]}"
    fi
}

# Function to detect display server
detect_display_server() {
    print_status "Detecting display server..."
    
    if [[ -n "$DISPLAY" ]]; then
        CURRENT_DISPLAY="$DISPLAY"
        print_status "Current DISPLAY variable: $DISPLAY"
    else
        CURRENT_DISPLAY=""
        print_status "No DISPLAY variable set"
    fi
    
    # Check for running X server
    if pgrep -f "X.*:0" > /dev/null; then
        DISPLAY_SERVER="x11"
        print_success "Detected running X11 server on :0"
    elif pgrep -f "X.*:1" > /dev/null; then
        DISPLAY_SERVER="x11"
        print_success "Detected running X11 server on :1"
    elif pgrep -f "Xvfb" > /dev/null; then
        DISPLAY_SERVER="xvfb"
        print_status "Detected running Xvfb virtual display"
    else
        DISPLAY_SERVER="none"
        print_status "No display server detected"
    fi
}

# Function to get intelligent user input
get_smart_user_input() {
    echo
    print_status "Based on system detection, here are your options:"
    echo
    
    # Display current system state
    echo "📊 Current System State:"
    echo "   Desktop Environment: $DESKTOP_ENV"
    echo "   Desktop Running: $DESKTOP_RUNNING"
    echo "   Display Server: $DISPLAY_SERVER"
    echo "   VNC Processes: ${VNC_PROCESSES[*]:-none}"
    echo "   Current Display: ${CURRENT_DISPLAY:-not set}"
    echo
    
    # Ask about installation type
    print_question "How would you like to set up Selkies?"
    echo "1) Use existing desktop environment (recommended if you have one)"
    echo "2) Create new virtual desktop environment (for headless servers)"
    echo "3) Install both Plasma and XFCE - choose on startup (recommended for headless)"
    echo "4) Connect to existing VNC session"
    echo "5) Let me choose specific settings"
    
    while true; do
        read -p "Enter choice (1-5): " INSTALL_TYPE
        case $INSTALL_TYPE in
            1) 
                if [[ "$DESKTOP_ENV" != "none" ]]; then
                    print_status "Will use existing $DESKTOP_ENV desktop environment"
                    break
                else
                    print_error "No desktop environment detected. Please choose option 2, 3, or 4."
                fi
                ;;
            2) 
                print_status "Will create new virtual desktop environment (XFCE)"
                VIRTUAL_DE="xfce"
                break
                ;;
            3) 
                print_status "Will install both Plasma and XFCE - you can choose on startup"
                VIRTUAL_DE="both"
                break
                ;;
            4) 
                if [[ ${#VNC_PROCESSES[@]} -gt 0 ]]; then
                    print_status "Will connect to existing VNC session"
                    break
                else
                    print_error "No VNC processes detected. Please choose option 1, 2, or 3."
                fi
                ;;
            5) 
                print_status "Will allow custom configuration"
                break
                ;;
            *) 
                print_error "Invalid choice. Please enter 1-5."
                ;;
        esac
    done
    
    # Get basic configuration
    echo
    print_question "Basic Configuration:"
    
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
    
    # Get resolution (only if creating virtual desktop)
    if [[ "$INSTALL_TYPE" == "2" ]]; then
        read -p "Enter display resolution (default: 1920x1080): " DISPLAY_RESOLUTION
        DISPLAY_RESOLUTION=${DISPLAY_RESOLUTION:-1920x1080}
    else
        DISPLAY_RESOLUTION="auto"
    fi
    
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

    # Ask about resize behavior
    echo "Select resize behavior:"
    echo "1) Disable resize (recommended for existing desktops)"
    echo "2) Enable resize (for virtual desktops only)"
    read -p "Enter choice (1-2, default: 1): " RESIZE_CHOICE

    case $RESIZE_CHOICE in
        2) ENABLE_RESIZE="true" ;;
        *) ENABLE_RESIZE="false" ;;
    esac
}

# Function to cleanup existing installations
cleanup_existing() {
    print_status "Cleaning up any existing installations..."
    
    # Stop any running services
    sudo systemctl stop selkies.service 2>/dev/null || true
    
    # Kill any existing processes
    pkill -f selkies-gstreamer || true
    pkill -f xfce4-session || true
    pkill -f plasmashell || true
    pkill -f plasma-workspace || true
    pkill -f pulseaudio || true
    pkill -f Xvfb || true
    
    # Wait for processes to terminate
    sleep 3
    
    # Remove problematic log files from /tmp
    sudo rm -f /tmp/*_selkies.log 2>/dev/null || true
    sudo rm -rf /tmp/pulse 2>/dev/null || true
    
    # Clean up user-specific directories
    rm -rf ~/.selkies 2>/dev/null || true
    
    print_success "Cleanup completed"
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

# Function to update system
update_system() {
    print_status "Updating system packages..."
    sudo apt update
    sudo apt upgrade -y
    print_success "System updated"
}

# Function to install minimal dependencies
install_minimal_dependencies() {
    print_status "Installing minimal required dependencies..."
    
    # Core dependencies that are always needed
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
        screen
    
    print_success "Minimal dependencies installed"
}

# Function to install desktop environment if needed
install_desktop_environment() {
    if [[ "$INSTALL_TYPE" == "2" ]]; then
        print_status "Installing XFCE desktop environment for virtual display..."
        
        # Install XFCE as it's lightweight and works well in virtual environments
        sudo apt install --no-install-recommends -y xfce4 xfce4-goodies
        
        print_success "XFCE desktop environment installed"
    elif [[ "$INSTALL_TYPE" == "3" ]]; then
        print_status "Installing both Plasma and XFCE desktop environments..."
        
        # Install Plasma (KDE)
        print_status "Installing Plasma (KDE)..."
        sudo apt install --no-install-recommends -y \
            plasma-desktop \
            plasma-workspace \
            kde-runtime \
            kde-standard \
            dolphin \
            konsole \
            kate \
            krunner
        
        # Install XFCE
        print_status "Installing XFCE..."
        sudo apt install --no-install-recommends -y xfce4 xfce4-goodies
        
        print_success "Both Plasma and XFCE desktop environments installed"
    else
        print_status "Using existing desktop environment - no additional installation needed"
    fi
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

# Function to create smart startup script
create_smart_startup_script() {
    print_status "Creating intelligent startup script..."
    
    # Create user-specific directories
    mkdir -p ~/.selkies/logs
    mkdir -p ~/.selkies/runtime
    
    cat > ~/start-selkies.sh << EOF
#!/bin/bash

# Selkies Smart Startup Script V0.2
# This script intelligently starts Selkies based on your system configuration

set -e

# Set environment variables
export PIPEWIRE_LATENCY="128/48000"
export XDG_RUNTIME_DIR="\$HOME/.selkies/runtime"
export PIPEWIRE_RUNTIME_DIR="\$HOME/.selkies/runtime"
export PULSE_RUNTIME_PATH="\$HOME/.selkies/runtime/pulse"
export PULSE_SERVER="unix:\$HOME/.selkies/runtime/pulse/native"

# Create necessary directories with proper permissions
mkdir -p "\$HOME/.selkies/runtime/pulse"
mkdir -p "\$HOME/.selkies/logs"
chmod 700 "\$HOME/.selkies/runtime"
chmod 700 "\$HOME/.selkies/logs"

# Kill existing Selkies processes
pkill -f selkies-gstreamer || true
sleep 2

# Determine display configuration based on installation type
EOF

    # Add display configuration based on installation type
    if [[ "$INSTALL_TYPE" == "1" ]]; then
        # Use existing desktop environment
        cat >> ~/start-selkies.sh << 'EOF'
# Using existing desktop environment
if [[ -n "$DISPLAY" ]]; then
    echo "Using existing display: $DISPLAY"
    SELKIES_DISPLAY="$DISPLAY"
else
    echo "No DISPLAY set, trying to detect..."
    # Try to find an existing display
    for i in {0..9}; do
        if xdpyinfo -display ":$i" >/dev/null 2>&1; then
            SELKIES_DISPLAY=":$i"
            echo "Found display: $SELKIES_DISPLAY"
            break
        fi
    done
    
    if [[ -z "$SELKIES_DISPLAY" ]]; then
        echo "No existing display found, starting Xvfb"
        Xvfb :99 -screen 0 1920x1080x24 +extension "COMPOSITE" +extension "DAMAGE" +extension "GLX" +extension "RANDR" +extension "RENDER" +extension "MIT-SHM" +extension "XFIXES" +extension "XTEST" +iglx +render -nolisten "tcp" -ac -noreset -shmem >"\$HOME/.selkies/logs/Xvfb_selkies.log" 2>&1 &
        sleep 3
        SELKIES_DISPLAY=":99"
    fi
fi

export DISPLAY="\$SELKIES_DISPLAY"
EOF
    elif [[ "$INSTALL_TYPE" == "2" ]]; then
        # Create virtual desktop environment
        cat >> ~/start-selkies.sh << EOF
# Creating virtual desktop environment
export DISPLAY=":99"

# Kill existing processes
pkill -f Xvfb || true
pkill -f pulseaudio || true
pkill -f xfce4-session || true
sleep 2

# Start virtual display server
Xvfb :99 -screen 0 ${DISPLAY_RESOLUTION}x24 +extension "COMPOSITE" +extension "DAMAGE" +extension "GLX" +extension "RANDR" +extension "RENDER" +extension "MIT-SHM" +extension "XFIXES" +extension "XTEST" +iglx +render -nolisten "tcp" -ac -noreset -shmem >"\$HOME/.selkies/logs/Xvfb_selkies.log" 2>&1 &

# Wait for display server
sleep 3

# Check if Xvfb started successfully
if ! pgrep -f "Xvfb :99" > /dev/null; then
    echo "ERROR: Failed to start Xvfb"
    exit 1
fi

# Start PulseAudio
pulseaudio --verbose --log-target=file:"\$HOME/.selkies/logs/pulseaudio_selkies.log" --disallow-exit --exit-idle-time=-1 --file=/etc/pulse/default.pa --runtime-dir="\$HOME/.selkies/runtime/pulse" &

# Wait for audio server
sleep 2

# Start desktop environment
DISPLAY=:99 xfce4-session >"\$HOME/.selkies/logs/xfce4_selkies.log" 2>&1 &

# Wait for desktop
sleep 5
EOF
    elif [[ "$INSTALL_TYPE" == "3" ]]; then
        # Dual desktop environment - choose on startup
        cat >> ~/start-selkies.sh << 'EOF'
# Dual Desktop Environment - Choose on startup
export DISPLAY=":99"

# Kill existing processes
pkill -f Xvfb || true
pkill -f pulseaudio || true
pkill -f xfce4-session || true
pkill -f plasmashell || true
sleep 2

# Start virtual display server
Xvfb :99 -screen 0 1920x1080x24 +extension "COMPOSITE" +extension "DAMAGE" +extension "GLX" +extension "RANDR" +extension "RENDER" +extension "MIT-SHM" +extension "XFIXES" +extension "XTEST" +iglx +render -nolisten "tcp" -ac -noreset -shmem >"$HOME/.selkies/logs/Xvfb_selkies.log" 2>&1 &

# Wait for display server
sleep 3

# Check if Xvfb started successfully
if ! pgrep -f "Xvfb :99" > /dev/null; then
    echo "ERROR: Failed to start Xvfb"
    exit 1
fi

# Start PulseAudio
pulseaudio --verbose --log-target=file:"$HOME/.selkies/logs/pulseaudio_selkies.log" --disallow-exit --exit-idle-time=-1 --file=/etc/pulse/default.pa --runtime-dir="$HOME/.selkies/runtime/pulse" &

# Wait for audio server
sleep 2

# Ask user which desktop environment to use
echo "=========================================="
echo "    Choose Your Desktop Environment"
echo "=========================================="
echo
echo "1) Plasma (KDE) - Modern, feature-rich"
echo "2) XFCE - Lightweight, fast"
echo
read -p "Enter your choice (1-2, default: 1): " DESKTOP_CHOICE
DESKTOP_CHOICE=${DESKTOP_CHOICE:-1}

case $DESKTOP_CHOICE in
    2)
        echo "Starting XFCE desktop environment..."
        DISPLAY=:99 xfce4-session >"$HOME/.selkies/logs/xfce4_selkies.log" 2>&1 &
        sleep 5
        ;;
    *)
        echo "Starting Plasma (KDE) desktop environment..."
        DISPLAY=:99 startplasma-x11 >"$HOME/.selkies/logs/plasma_selkies.log" 2>&1 &
        sleep 8
        ;;
esac
EOF
    elif [[ "$INSTALL_TYPE" == "4" ]]; then
        # Connect to VNC
        cat >> ~/start-selkies.sh << 'EOF'
# Connecting to existing VNC session
echo "Connecting to existing VNC session..."
# This will use the existing display from VNC
EOF
    fi

    # Add the Selkies startup command
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
    print_success "Smart startup script created: ~/start-selkies.sh"
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
Group=$USER
WorkingDirectory=$HOME
ExecStart=$HOME/start-selkies.sh
Restart=always
RestartSec=10
Environment=XDG_RUNTIME_DIR=$HOME/.selkies/runtime
Environment=PIPEWIRE_RUNTIME_DIR=$HOME/.selkies/runtime
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
pkill -f plasmashell || true
pkill -f plasma-workspace || true
pkill -f pulseaudio || true
pkill -f Xvfb || true

# Wait for processes to terminate
sleep 3

# Clean up runtime directories
rm -rf ~/.selkies/runtime/pulse 2>/dev/null || true
rm -rf ~/.selkies/runtime/X* 2>/dev/null || true

echo "Selkies services stopped"
EOF
    
    chmod +x ~/stop-selkies.sh
    print_success "Stop script created: ~/stop-selkies.sh"
}

# Function to verify installation
verify_installation() {
    print_status "Verifying installation..."
    
    # Check if directories exist and have correct permissions
    if [[ ! -d ~/.selkies ]]; then
        print_error "User directory not created"
        return 1
    fi
    
    if [[ ! -d ~/.selkies/logs ]]; then
        print_error "Logs directory not created"
        return 1
    fi
    
    if [[ ! -d ~/.selkies/runtime ]]; then
        print_error "Runtime directory not created"
        return 1
    fi
    
    # Set correct permissions
    chmod 700 ~/.selkies
    chmod 700 ~/.selkies/logs
    chmod 700 ~/.selkies/runtime
    
    # Check if startup script exists and is executable
    if [[ ! -x ~/start-selkies.sh ]]; then
        print_error "Startup script not found or not executable"
        return 1
    fi
    
    # Check if stop script exists and is executable
    if [[ ! -x ~/stop-selkies.sh ]]; then
        print_error "Stop script not found or not executable"
        return 1
    fi
    
    # Check if Selkies directory exists
    if [[ ! -d ~/selkies-gstreamer ]]; then
        print_error "Selkies directory not found"
        return 1
    fi
    
    print_success "Installation verification completed"
}

# Function to display final information
display_final_info() {
    echo
    print_success "Selkies V0.2 installation completed!"
    echo
    echo "=== Installation Summary ==="
    echo "Installation Type: $INSTALL_TYPE"
    echo "Desktop Environment: $DESKTOP_ENV"
    echo "Display Server: $DISPLAY_SERVER"
    echo "Port: $SELKIES_PORT"
    echo "Encoder: $SELKIES_ENCODER"
    echo "HTTPS: $ENABLE_HTTPS"
    echo
    echo "=== Connection Information ==="
    # Get public IP with fallback
    PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || curl -s --max-time 5 ipinfo.io/ip 2>/dev/null || echo "YOUR_SERVER_IP")
    echo "URL: http://${PUBLIC_IP}:$SELKIES_PORT"
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
    echo "Xvfb logs: ~/.selkies/logs/Xvfb_selkies.log"
    echo "Audio logs: ~/.selkies/logs/pulseaudio_selkies.log"
    echo "Desktop logs: ~/.selkies/logs/xfce4_selkies.log"
    if [[ "$INSTALL_TYPE" == "3" ]]; then
        echo "Plasma logs: ~/.selkies/logs/plasma_selkies.log"
        echo
        echo "=== Dual Desktop Usage ==="
        echo "When you start Selkies, you'll be prompted to choose:"
        echo "• Plasma (KDE) - Modern, feature-rich desktop"
        echo "• XFCE - Lightweight, fast desktop"
    fi
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
    print_header
    
    check_root
    cleanup_existing
    check_requirements
    
    # Detect system state
    detect_desktop_environment
    detect_vnc_processes
    detect_display_server
    
    # Get user input based on detected state
    get_smart_user_input
    
    update_system
    install_minimal_dependencies
    install_desktop_environment
    install_selkies
    create_smart_startup_script
    create_systemd_service
    configure_firewall
    create_stop_script
    verify_installation
    display_final_info
    start_selkies
    
    echo
    print_success "Installation completed successfully!"
    echo "You can now access your remote desktop through your web browser."
}

# Run main function
main "$@"
