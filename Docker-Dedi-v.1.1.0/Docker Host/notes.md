# Selkies Container Commands

## Container Management
```bash
# Start the selkies container
docker-compose up -d selkies-desktop

# Stop the container
docker-compose down

# View container logs
docker logs selkies-desktop -f

# Check container status
docker ps | grep selkies-desktop
```

## Accessing the Container
```bash
# Access container shell directly
docker exec -it selkies-desktop bash

# Access as ubuntu user (recommended)
docker exec -it selkies-desktop su - ubuntu

# One-liner to get into ubuntu home directory
docker exec -it selkies-desktop bash -c "cd /home/ubuntu && su - ubuntu"
```

## File Operations
```bash
# Copy files FROM container to host
docker cp selkies-desktop:/home/ubuntu/filename.txt ./

# Copy files TO container from host
docker cp ./filename.txt selkies-desktop:/home/ubuntu/

# Copy entire directory from container
docker cp selkies-desktop:/home/ubuntu/project/ ./project/

# View container filesystem without entering
docker exec selkies-desktop ls -la /home/ubuntu/
```

## System Info & Monitoring
```bash
# Check container resource usage
docker stats selkies-desktop

# View running processes in container
docker exec selkies-desktop ps aux

# Check disk usage in container
docker exec selkies-desktop df -h

# View container network info
docker exec selkies-desktop ip addr show
```

## Web Access
- Desktop GUI: http://localhost:8080 (ubuntu/selkies123)
- Container uses host networking mode for easy access

## Troubleshooting
```bash
# Restart container if issues
docker restart selkies-desktop

# Check container health
docker inspect selkies-desktop | grep -A 10 "Health"

# View detailed container info
docker inspect selkies-desktop
```

Once your `docker-compose-gaming.service` is properly set up, you can manage it with these simple commands:

**Basic Control:**
```bash
# Start your gaming services
sudo systemctl start docker-compose-gaming.service

# Stop your gaming services  
sudo systemctl stop docker-compose-gaming.service

# Restart your gaming services
sudo systemctl restart docker-compose-gaming.service

# Check if it's running
sudo systemctl status docker-compose-gaming.service
```

**Auto-start Management:**
```bash
# Enable auto-start on boot (run once)
sudo systemctl enable docker-compose-gaming.service

# Disable auto-start on boot
sudo systemctl disable docker-compose-gaming.service
```

**Quick Status Check:**
```bash
# See if your containers are running
docker ps

# Or check the service logs if something's wrong
journalctl -u docker-compose-gaming.service -f
```

**Pro tip:** You can also create a simple alias in your `~/.bashrc` to make it even easier:
```bash
alias gaming-start='sudo systemctl start docker-compose-gaming.service'
alias gaming-stop='sudo systemctl stop docker-compose-gaming.service'
alias gaming-status='sudo systemctl status docker-compose-gaming.service'
```

Then you can just type `gaming-start`, `gaming-stop`, or `gaming-status` from anywhere! The service approach is much cleaner than manually running `docker-compose up -d` every time, and it integrates nicely with your system's boot process.





USER LEVEL SERVICE

# Create a new sudoers file for your gaming service
sudo visudo -f /etc/sudoers.d/docker-gaming-service

# Allow docker user to manage gaming service without password
docker ALL=(ALL) NOPASSWD: /bin/systemctl start docker-compose-gaming.service
docker ALL=(ALL) NOPASSWD: /bin/systemctl stop docker-compose-gaming.service  
docker ALL=(ALL) NOPASSWD: /bin/systemctl restart docker-compose-gaming.service
docker ALL=(ALL) NOPASSWD: /bin/systemctl status docker-compose-gaming.service
docker ALL=(ALL) NOPASSWD: /bin/systemctl enable docker-compose-gaming.service
docker ALL=(ALL) NOPASSWD: /bin/systemctl disable docker-compose-gaming.service


sudo systemctl start docker-compose-gaming.service    # No password needed!
sudo systemctl stop docker-compose-gaming.service
sudo systemctl status docker-compose-gaming.service