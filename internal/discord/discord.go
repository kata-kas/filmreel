package discord

import (
	"fmt"
	"log"
	"os"
	"os/signal"

	"github.com/bwmarrin/discordgo"
	"github.com/kata-kas/katabot/internal/discord/commands"
)

func InitializeBot() {
	token := os.Getenv("DISCORD_TOKEN")
	bot, err := discordgo.New("Bot " + token)
	if err != nil {
		log.Fatal(err)
	}

	bot.AddHandler(func(s *discordgo.Session, r *discordgo.Ready) {
		log.Printf("Logged in as: %v#%v", s.State.User.Username, s.State.User.Discriminator)
	})

	commands.RegisterCommands(bot)

	bot.Identify.Intents = discordgo.IntentsAllWithoutPrivileged

	err = bot.Open()
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Adding commands...")

	defer bot.Close()

	fmt.Println("the bot is online")

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	log.Println("Press Ctrl+C to exit")
	<-stop

	log.Println("Gracefully shutting down.")
}
