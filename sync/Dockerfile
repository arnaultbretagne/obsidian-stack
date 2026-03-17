FROM node:22-bookworm-slim
RUN npm install -g obsidian-headless

RUN useradd -m -u 1000 obsidian
WORKDIR /vault

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER obsidian
ENTRYPOINT ["/entrypoint.sh"]
