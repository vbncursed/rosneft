# Carries only the built SPA: CD copies /dist out of this image into the nginx
# docroot. Build context is frontend/. Node matches .github/workflows/frontend.yml.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000
COPY . .
# .env.production (tracked, VITE_API_URL empty) rides along in the context.
RUN yarn build

FROM scratch
COPY --from=build /app/dist /dist
