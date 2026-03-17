FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install
RUN npx playwright install --with-deps chromium

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

EXPOSE 3000
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
ENTRYPOINT ["./entrypoint.sh"]
