FROM ghcr.io/puppeteer/puppeteer:latest

# 1. Correct the path (Removed '-stable')
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome

USER root
WORKDIR /app

# 2. Copy package files
COPY package*.json ./

# 3. Install dependencies
RUN npm install --omit=dev

# 4. Copy your code
COPY . .

# 5. Fix permissions for the views folder and the puppeteer user
RUN chmod -R 755 /app/views
# The base image uses a user named 'pptruser' for security
RUN chown -R pptruser:pptruser /app

# Switch to the non-root user (Best Practice)
USER pptruser

EXPOSE 10000

CMD ["node", "server.js"]