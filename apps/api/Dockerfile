# Multi-stage build for the API. Render (and most container hosts) build from
# the repo root, so every COPY path here is relative to the monorepo root, not
# to apps/api — that mismatch is the single most common way this file breaks.

FROM node:20-slim AS base
RUN corepack enable
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- deps: install once, cached across builds unless lockfiles change ------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/srs/package.json packages/srs/package.json
COPY packages/scoring/package.json packages/scoring/package.json
RUN pnpm install --frozen-lockfile

# ---- build: compile the packages the API depends on, then the API itself --
FROM base AS build
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter @sprout/shared build \
 && pnpm --filter @sprout/srs build \
 && pnpm --filter @sprout/scoring build \
 && pnpm --filter @sprout/api exec prisma generate \
 && pnpm --filter @sprout/api build

# ---- runtime: only what is needed to run, not to build ---------------------
FROM base AS runtime
ENV NODE_ENV=production

# OpenSSL is installed in base so Prisma detects the same engine in every stage.

COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json ./
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/srs/package.json packages/srs/package.json
COPY --from=build /app/packages/scoring/package.json packages/scoring/package.json
# --prod would drop the Prisma CLI, which is a devDependency here — and the
# container needs it at startup to run `prisma migrate deploy` against
# whatever database URL this deploy is pointed at. Installed in full instead;
# the extra size is dev tooling, not a security concern for a private image.
RUN pnpm install --frozen-lockfile --prod=false

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/srs/dist packages/srs/dist
COPY --from=build /app/packages/scoring/dist packages/scoring/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/content content

# Generated here rather than copied from the build stage. pnpm links
# @prisma/client out of its virtual store, so the generated client lands at a
# path that contains the resolved dependency versions — copying it means
# hard-coding a directory name that changes on every Prisma bump. Generating
# against the schema already copied above is stable and costs a few seconds.
RUN pnpm --filter @sprout/api exec prisma generate

EXPOSE 4000
WORKDIR /app/apps/api

# Migrations run at container start, not at build time: the database is not
# reachable from the build step, and a fresh deploy must not serve traffic
# against a schema it has not migrated yet.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
