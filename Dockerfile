# syntax=docker/dockerfile:1

# ---- Base: Debian-slim Node (argon2 has a native binding; avoid Alpine/musl) ----
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---- Dependencies (full, including dev — needed to build) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# `onlyBuiltDependencies` in package.json already whitelists the native build
# scripts we need (argon2, esbuild, …), so no need for --dangerouslyAllowAllBuilds
# (which conflicts with that allowlist under pnpm 10).
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM base AS build
COPY package.json pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
# `nest build` reads nest-cli.json + tsconfig.build.json (whose `exclude` scopes
# input to src so rootDir resolves against outDir).
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build
# Prune to production dependencies (rebuilds native modules like argon2 for this image).
RUN pnpm install --frozen-lockfile --prod

# ---- Runtime ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Run as the unprivileged 'node' user that ships with the image.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
