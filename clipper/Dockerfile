FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install
RUN npx playwright install --with-deps chromium

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Run as non-root so files written to the vault are owned by uid 1000,
# matching the code-server agent container.
RUN useradd -m -u 1000 clipper \
    && chown -R clipper:clipper /app \
    && mv /root/.cache/ms-playwright /home/clipper/.cache/ms-playwright \
    && chown -R clipper:clipper /home/clipper/.cache
USER clipper

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
