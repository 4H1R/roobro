# syntax=docker/dockerfile:1

FROM golang:1.27-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git
ENV GOPROXY=https://goproxy.cn,direct \
    CGO_ENABLED=0 \
    GOOS=linux \
    GOFLAGS=-buildvcs=false

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN --mount=type=cache,id=roobro-gobuild,target=/root/.cache/go-build \
    go build -tags nomsgpack -ldflags="-w -s" -o /out/api ./cmd/api

FROM alpine:3.24
RUN apk add --no-cache ca-certificates tzdata wget && adduser -D -u 10001 app
COPY --from=builder /out/api /usr/local/bin/api
USER app
EXPOSE 8080
CMD ["api"]
