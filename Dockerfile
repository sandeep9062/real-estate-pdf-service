FROM node:20-slim

# Install Chromium and necessary system dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Crucial for html-pdf-node/puppeteer to find the right binary
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
# Use --omit=dev to keep the image small and save RAM
RUN npm ci --omit=dev

COPY . .

EXPOSE 10000

# Updated CMD: 
# 1. Added memory limit to Node
# 2. Ensure your entry file name matches (you used server.js here, make sure it's not index.js)
CMD ["node", "server.js"]