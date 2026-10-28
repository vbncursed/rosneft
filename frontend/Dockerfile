# Carries only the built SPA: CD copies /dist out of this image into the nginx
# docroot. Build context is frontend/. Node matches .github/workflows/frontend.yml.
FROM node:26-alpine AS build
WORKDIR /app
RUN corepack enable
ENV YARN_HTTP_TIMEOUT=600000
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable
COPY . .
# .env.production (tracked, VITE_API_URL empty) rides along in the context.
RUN yarn build

FROM scratch
COPY --from=build /app/dist /dist
