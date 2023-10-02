package main

import (
	"github.com/kata-kas/katabot/bin/env"
	"github.com/kata-kas/katabot/internal/db"
	"github.com/kata-kas/katabot/internal/discord"
)

func main() {
	env.Load(".env")
	db.InitializeDatabase()
	discord.InitializeBot()
}
