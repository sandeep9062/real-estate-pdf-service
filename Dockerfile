FROM ghcr.io/puppeteer/puppeteer:latest

# 1. Skip downloading Chromium since the image has it
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

USER root
WORKDIR /app

# 2. Copy only package files first
COPY package*.json ./

# 3. Use 'npm ci' with --no-audit to save memory and speed up the build
RUN npm ci --omit=dev --no-audit

# 4. Copy the rest
COPY . .

RUN chmod -R 755 /app/views
RUN chown -R pptruser:pptruser /app

USER pptruser

EXPOSE 10000

CMD ["node", "server.js"]