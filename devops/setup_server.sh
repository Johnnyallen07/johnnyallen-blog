#!/bin/bash
set -e

# Update package list
sudo yum update -y

# Install git and dnf-plugins-core
sudo yum install -y git dnf-plugins-core

# Add Docker repository (CentOS compatible)
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# Install Docker Engine
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# Verify Docker installation
sudo docker run hello-world

echo "Docker installed successfully!"
