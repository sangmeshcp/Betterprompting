# syntax=docker/dockerfile:1.7
# ------------------------------------------------------------------
# Betterprompting — all-in-one image.
# Proxy on :8787, dashboard on :3000, SQLite under /data.
# ------------------------------------------------------------------

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY packages/db/package.json packages/db/
COPY packages/analyzer/package.json packages/analyzer/
COPY packages/cli/package.json packages/cli/
COPY apps/proxy/package.json apps/proxy/
COPY apps/web/package.json apps/web/
RUN npm install --workspaces --include-workspace-root --ignore-scripts \
  && npm rebuild better-sqlite3

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/
RUN npm --workspace @betterprompting/db run build \
  && npm --workspace @betterprompting/analyzer run build \
  && npm --workspace @betterprompting/proxy run build \
  && npm --workspace betterprompting run build \
  && npm --workspace @betterprompting/web run build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    BETTERPROMPTING_DIR=/data \
    HOST=0.0.0.0 \
    PORT=8787
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps /app/apps
VOLUME ["/data"]
EXPOSE 8787 3000
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["all"]
