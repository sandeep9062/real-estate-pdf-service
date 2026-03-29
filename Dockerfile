FROM ghcr.io/puppeteer/puppeteer:latest

# 1. We still skip the download because the image ALREADY has Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

USER root
WORKDIR /app

# 2. Copy package files and install
COPY package*.json ./
RUN npm install --omit=dev

# 3. Copy the rest of your code
COPY . .

# 4. Fix permissions so the 'pptruser' can read your EJS files
RUN chmod -R 755 /app/views
RUN chown -R pptruser:pptruser /app

# 5. Switch to the built-in non-root user (Security Best Practice)
USER pptruser

EXPOSE 10000

CMD ["node", "server.js"]