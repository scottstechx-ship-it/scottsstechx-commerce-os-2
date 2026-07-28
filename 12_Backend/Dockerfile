# Multi-stage Dockerfile for ScottsTechX 12_Backend.
# Stage 1: install + compile. Stage 2: slim runtime with the binary only.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install build deps for the embedded-postgres native binary.
# (Not strictly needed for `npm run build` but keeps `npm run smoke` working
# if you want to run a smoke test inside the image at build time.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install deps. Use npm install so the platform-binary postinstall runs.
COPY package.json package-lock.json ./
# Approve the embedded-postgres postinstall explicitly so the binary downloads.
ENV npm_config_allow_scripts="@embedded-postgres/linux-x64 @embedded-postgres/linux-arm64"
RUN npm install --no-audit --no-fund

# Copy source and build.
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
COPY migrations ./migrations
COPY openapi.json ./
RUN npm run build

# ----------------------------------------------------------------------------

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Runtime deps: tini for signal handling, openssl for JWT if you swap algs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy only what the runtime needs.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/openapi.json ./

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
