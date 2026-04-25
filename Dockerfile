erfileFROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]