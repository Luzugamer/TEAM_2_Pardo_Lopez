FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/nexo-core-api ./cmd/api

FROM alpine:3.22
RUN adduser -D -H nexo
USER nexo
COPY --from=build /out/nexo-core-api /usr/local/bin/nexo-core-api
EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/nexo-core-api"]
