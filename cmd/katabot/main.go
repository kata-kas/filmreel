package main

import (
	"github.com/kata-kas/katabot/bin/env"
	"github.com/kata-kas/katabot/internal/discord"
)

func main() {
	env.Load(".env")
	discord.InitializeBot()
}
