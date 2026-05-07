# syntax=docker/dockerfile:1.7
FROM golang:1.26-alpine AS build
WORKDIR /src

COPY go.work go.work.su[m] ./
COPY proto/go.mod proto/go.su[m] ./proto/
COPY pkg/go.mod pkg/go.su[m] ./pkg/
COPY services/gateway-service/go.mod services/gateway-service/go.su[m] ./services/gateway-service/
COPY services/catalog-service/go.mod services/catalog-service/go.su[m] ./services/catalog-service/
COPY services/mesh-service/go.mod services/mesh-service/go.su[m] ./services/mesh-service/
COPY services/asset-service/go.mod services/asset-service/go.su[m] ./services/asset-service/

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd services/asset-service && go mod download

COPY proto/ ./proto/
COPY pkg/ ./pkg/
COPY services/asset-service/ ./services/asset-service/

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd services/asset-service && \
    CGO_ENABLED=0 GOOS=linux go build \
        -trimpath -ldflags="-s -w" \
        -o /out/asset ./cmd/asset

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/asset /asset
USER nonroot:nonroot
EXPOSE 8081
ENTRYPOINT ["/asset"]
