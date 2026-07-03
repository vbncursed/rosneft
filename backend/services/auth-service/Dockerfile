FROM golang:1.26.4-alpine AS build
WORKDIR /src

COPY go.work go.work.su[m] ./
COPY proto/go.mod proto/go.su[m] ./proto/
COPY pkg/go.mod pkg/go.su[m] ./pkg/
COPY services/gateway-service/go.mod services/gateway-service/go.su[m] ./services/gateway-service/
COPY services/catalog-service/go.mod services/catalog-service/go.su[m] ./services/catalog-service/
COPY services/content-service/go.mod services/content-service/go.su[m] ./services/content-service/
COPY services/auth-service/go.mod services/auth-service/go.su[m] ./services/auth-service/
COPY services/twofa-service/go.mod services/twofa-service/go.su[m] ./services/twofa-service/
COPY services/mesh-service/go.mod services/mesh-service/go.su[m] ./services/mesh-service/
COPY services/asset-service/go.mod services/asset-service/go.su[m] ./services/asset-service/
COPY services/upload-service/go.mod services/upload-service/go.su[m] ./services/upload-service/

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd services/auth-service && go mod download

COPY proto/ ./proto/
COPY pkg/ ./pkg/
COPY services/auth-service/ ./services/auth-service/

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd services/auth-service && \
    CGO_ENABLED=0 GOOS=linux go build \
        -trimpath -ldflags="-s -w" \
        -o /out/auth ./cmd/auth

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/auth /auth
USER nonroot:nonroot
EXPOSE 9004
ENTRYPOINT ["/auth"]
