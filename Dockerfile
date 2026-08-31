FROM node:22-bookworm-slim AS dependencies
RUN apt-get update \
  && apt-get install --no-install-recommends -y openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

FROM dependencies AS build
COPY server server
COPY web web
RUN npm run prisma:generate --workspace server && npm run build

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install --no-install-recommends -y openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/node_modules node_modules
COPY --from=production-dependencies /app/package.json package.json
COPY --from=production-dependencies /app/server/package.json server/package.json
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prisma server/prisma
COPY --from=build /app/web/dist web/dist
COPY docker/entrypoint.sh docker/entrypoint.sh
RUN chmod +x docker/entrypoint.sh && chown -R node:node /app
USER node
EXPOSE 3000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
