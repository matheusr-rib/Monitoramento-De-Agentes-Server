# syntax=docker/dockerfile:1.7
FROM node:20 AS build
WORKDIR /app

COPY package.json package-lock.json* ./

RUN --mount=type=secret,id=github_token,required=true \
    sh -ec 'TOKEN="$(cat /run/secrets/github_token)"; \
      printf "%s\n" \
        "@lewe-negocios:registry=https://npm.pkg.github.com/" \
        "//npm.pkg.github.com/:_authToken=${TOKEN}" \
        "always-auth=true" > /tmp/npmrc; \
      npm_config_userconfig=/tmp/npmrc npm install --no-audit --no-fund; \
      rm -f /tmp/npmrc'

COPY . .
RUN rm -rf dist || true
RUN npm run build

FROM node:20-slim AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN --mount=type=secret,id=github_token,required=true \
    sh -ec 'TOKEN="$(cat /run/secrets/github_token)"; \
      printf "%s\n" \
        "@lewe-negocios:registry=https://npm.pkg.github.com/" \
        "//npm.pkg.github.com/:_authToken=${TOKEN}" \
        "always-auth=true" > /tmp/npmrc; \
      npm_config_userconfig=/tmp/npmrc npm install --omit=dev --no-audit --no-fund; \
      rm -f /tmp/npmrc'

COPY --from=build /app/dist ./dist

RUN groupadd -r nodeuser && useradd -r -g nodeuser nodeuser
RUN chown -R nodeuser:nodeuser /app
USER nodeuser

EXPOSE 3000
CMD ["node", "dist/index.js"]
