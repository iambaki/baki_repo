FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=ptat_ca \
    if [ -f /run/secrets/ptat_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ptat_ca; fi; \
    npm ci --no-audit --no-fund --fetch-timeout=60000 --fetch-retries=1
COPY . .
# Disposable build-only SQLite state; never copied to runtime.
RUN PTAT_DATA_DIR=/tmp/ptat-build PTAT_DEMO_PASSWORD=disposable-build-identity npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/next.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/app ./app
RUN mkdir .data && chown node:node .data
USER node
EXPOSE 3000
CMD ["npm", "start"]
