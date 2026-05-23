# Use official Node.js runtime as parent image
FROM node:20-slim

# Install Tor, python3, and build tools for native npm compilation
RUN apt-get update && apt-get install -y \
    tor \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency packages
COPY package*.json ./

# Install packages
RUN npm install

# Copy all source files
COPY . .

# Build Vite application & compile backend (triggers generate-tor.ts for persistent address)
RUN npm run build

# Expose port (Backend serves over port 3000)
EXPOSE 3000

# Set production environment flags
ENV NODE_ENV=production

# Start the Node server (which automatically spawns Tor in the background)
CMD ["npm", "start"]
