FROM golang:1.26.4-alpine AS build
WORKDIR /src

# Copy workspace + module manifests for dependency caching
COPY go.work go.work.su[m] ./
COPY proto/go.mod proto/go.su[m] ./proto/
COPY pkg/go.mod pkg/go.su[m] ./pkg/
COPY services/gateway-service/go.mod services/gateway-service/go.su[m] ./services/gateway-service/
COPY services/catalog-service/go.mod services/catalog-service/go.su[m] ./services/catalog-service/
COPY services/auth-service/go.mod services/auth-service/go.su[m] ./services/auth-service/
COPY services/twofa-service/go.mod services/twofa-service/go.su[m] ./services/twofa-service/
COPY services/mesh-service/go.mod services/mesh-service/go.su[m] ./services/mesh-service/
COPY services/asset-service/go.mod services/asset-service/go.su[m] ./services/asset-service/
COPY services/upload-service/go.mod services/upload-service/go.su[m] ./services/upload-service/

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd services/gateway-service && go mod download

# Copy sources
COPY proto/ ./proto/
COPY pkg/ ./pkg/
COPY services/gateway-service/ ./services/gateway-service/

# Build static binary
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd services/gateway-service && \
    CGO_ENABLED=0 GOOS=linux go build \
        -trimpath -ldflags="-s -w" \
        -o /out/gateway ./cmd/gateway

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/gateway /gateway
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/gateway"]
