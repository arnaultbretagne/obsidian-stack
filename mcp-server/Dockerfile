FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build
COPY src/assets/ ./dist/assets/
RUN find src -name '*.md' -exec sh -c 'for f; do mkdir -p "dist/$(dirname "${f#src/}")" && cp "$f" "dist/${f#src/}"; done' _ {} +

# Run as non-root so files written to the vault are owned by uid 1000,
# matching the code-server agent container.
RUN chown -R node:node /app
USER node

EXPOSE 4000
CMD ["node", "dist/index.js"]
