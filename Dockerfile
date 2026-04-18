FROM ghcr.io/puppeteer/puppeteer:latest

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

# Switch to root ONLY to set permissions
USER root

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --no-audit

COPY . .

# Set permissions while still root
RUN chmod -R 755 /app/views

# Switch back to the puppeteer user for security
USER pptruser

EXPOSE 10000

CMD ["node", "server.js"]