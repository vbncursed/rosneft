FROM golang:1.26.4-alpine AS build
WORKDIR /src

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
    cd services/upload-service && go mod download

COPY proto/ ./proto/
COPY pkg/ ./pkg/
COPY services/upload-service/ ./services/upload-service/

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    cd services/upload-service && \
    CGO_ENABLED=0 GOOS=linux go build \
        -trimpath -ldflags="-s -w" \
        -o /out/upload ./cmd/upload

# Pre-create both BlobStore root and the incoming-upload dir as nonroot
# so the named volumes attached at those paths inherit nonroot ownership.
RUN mkdir -p /out/blob /out/incoming

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/upload /upload
COPY --from=build --chown=nonroot:nonroot /out/blob /var/blob
COPY --from=build --chown=nonroot:nonroot /out/incoming /var/upload/incoming
USER nonroot:nonroot
EXPOSE 9003
ENTRYPOINT ["/upload"]
