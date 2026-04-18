FROM ghcr.io/puppeteer/puppeteer:latest

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

WORKDIR /app

# Copy package files (both package.json AND package-lock.json)
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev --no-audit

# Copy app files
COPY . .

# Fix permissions for views folder
RUN chmod -R 755 /app/views

EXPOSE 10000

CMD ["node", "server.js"]