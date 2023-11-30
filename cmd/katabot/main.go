package main

import (
	"github.com/kata-kas/katabot/bin/env"
	"github.com/kata-kas/katabot/internal/db"
	"github.com/kata-kas/katabot/internal/discord"
	"github.com/kata-kas/katabot/internal/scraper"
)

func main() {
	env.Load(".env")
	db.InitializeDatabase()
	scraper.StartJobQueue()
	discord.InitializeBot()
}
