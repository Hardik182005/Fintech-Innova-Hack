# CredenceAI frontend BFF. The standalone output carries the server, its
# pruned node_modules, and the static assets — nothing else. Secrets
# (CREDENCE_DEMO_TOKEN) arrive as runtime env from Secret Manager; nothing is
# baked at build time, which is also why no NEXT_PUBLIC_ variables exist in
# this app.

FROM node:24-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-slim

WORKDIR /app

RUN groupadd -r app && useradd -r -g app app

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# No `public/` copy: this app serves no static files from it. The Next.js
# scaffold SVGs that used to sit there were unreferenced and were removed, and
# a COPY of a directory that does not exist fails the build.

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0

USER app

EXPOSE 3000
CMD ["sh", "-c", "PORT=${PORT:-3000} node server.js"]
