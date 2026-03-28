FROM ghcr.io/puppeteer/puppeteer:latest

USER root
WORKDIR /app

# 1. SET THIS ENV VARIABLE TO SKIP DOWNLOAD
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./

# 2. This will now take 5 seconds instead of 10 minutes
RUN npm install --production

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]