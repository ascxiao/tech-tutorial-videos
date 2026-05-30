# Use a lightweight Node.js base image
FROM node:18-bullseye-slim

# Install system dependencies: Python 3, pip, FFmpeg, and build essentials
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Pre-install key Python dependencies for speech synthesis and transcription
RUN pip3 install --no-cache-dir --upgrade pip \
    && pip3 install --no-cache-dir edge-tts faster-whisper

# Set the working directory
WORKDIR /app

# Copy package files and install NPM dependencies
COPY package*.json ./
RUN npm install

# Copy all project source code
COPY . .

# Expose Vite creator dashboard dev/production port (3000) and Express server API port (3005)
EXPOSE 3000
EXPOSE 3005

# Start both servers concurrently
CMD ["npm", "run", "dev"]
