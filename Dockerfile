FROM node:22.23.1-bookworm-slim AS workspace
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/mini-program/package.json apps/mini-program/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/validation/package.json packages/validation/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .

FROM workspace AS api-build
RUN pnpm --filter @scan-wifi/api build \
  && pnpm --filter @scan-wifi/api deploy --prod --legacy /prod/api

FROM node:22.23.1-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app

COPY --from=api-build --chown=node:node /prod/api/ ./
COPY --from=api-build --chown=node:node /workspace/apps/api/dist/ ./dist/
RUN mkdir -p /app/storage/qrcodes && chown -R node:node /app/storage

USER node
EXPOSE 3100
CMD ["node", "dist/server.js"]

FROM workspace AS admin-build
ARG VITE_API_BASE_URL
ARG VITE_DEMO_MODE=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE
RUN node --input-type=module -e "import { assertReleaseApiBaseUrl } from './scripts/production-gates.mjs'; assertReleaseApiBaseUrl(process.env.VITE_API_BASE_URL, 'VITE_API_BASE_URL');" \
  && pnpm --filter @scan-wifi/admin-web build

FROM nginx:1.30.3-alpine AS admin
COPY deploy/nginx-admin.conf /etc/nginx/nginx.conf
COPY --from=admin-build /workspace/apps/admin-web/dist/ /usr/share/nginx/html/
EXPOSE 8080
ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]
