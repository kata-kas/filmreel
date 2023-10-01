FROM golang:1.19.5-bullseye

WORKDIR /app

COPY . .

RUN go mod download

RUN go build ./cmd/katabot

ENTRYPOINT [ "/app/katabot" ]