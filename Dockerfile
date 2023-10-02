FROM golang:1.21.1-bullseye

WORKDIR /app

COPY . .

RUN go mod download

RUN go build ./cmd/katabot

ENTRYPOINT [ "/app/katabot" ]