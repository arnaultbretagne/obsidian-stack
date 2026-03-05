FROM node:22-bookworm-slim

# Install Playwright system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
      libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
      libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
      libasound2 libxshmfence1 fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install
RUN npx playwright install chromium

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

EXPOSE 3000
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
ENTRYPOINT ["./entrypoint.sh"]
