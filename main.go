package main

import (
	_ "github.com/joho/godotenv/autoload"
	"github.com/kata-kas/filmreel/db"
	"github.com/kata-kas/filmreel/discord"
	"github.com/kata-kas/filmreel/scraper"
)

func main() {
	db.InitializeDatabase()
	scraper.StartJobQueue()
	discord.InitializeBot()
}
