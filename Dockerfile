FROM ghcr.io/puppeteer/puppeteer:latest

# 1. Essential: Skip the slow Chromium download entirely
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

USER root
WORKDIR /app

# 2. Only copy package files first
COPY package*.json ./

# 3. Use --omit=dev to keep the build light and fast
RUN npm install --omit=dev

# 4. Copy the rest of your code
COPY . .

# 5. Grant permissions to the views folder
RUN chmod -R 755 /app/views

EXPOSE 10000

CMD ["node", "server.js"]