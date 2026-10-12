FROM golang:1.23-alpine AS builder

WORKDIR /app

# Use goproxy.io instead of proxy.golang.org to avoid TLS timeouts in Docker Desktop
ENV GOPROXY=https://goproxy.io,direct

# Copy module definition — go.sum is generated inside the container
# so no local Go installation is required on the host machine.
COPY go.mod ./

# Copy source before tidy so it can resolve imports
COPY . .

# Generate go.sum and download all dependencies, then build
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /go-sync ./cmd/server

# ── Minimal runtime image ──────────────────────────────────────────────────────
FROM alpine:3.20 AS runtime
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /go-sync /go-sync

EXPOSE 8080
ENTRYPOINT ["/go-sync"]
