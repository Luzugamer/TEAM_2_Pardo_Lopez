FROM golang:1.27 AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/onsite-api ./cmd/api
FROM gcr.io/distroless/static-debian12
COPY --from=build /out/onsite-api /onsite-api
EXPOSE 8082
ENTRYPOINT ["/onsite-api"]
