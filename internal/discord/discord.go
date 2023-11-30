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

	bot.AddHandler(func(s *discordgo.Session, m *discordgo.MessageCreate) {
		if m.Author != nil && m.Author.ID != s.State.User.ID {
			s.MessageReactionAdd(m.ChannelID, m.ID, "👍")
		}
	})

	err = bot.Open()
	if err != nil {
		log.Fatal(err)
	}

	commands.RegisterCommands(bot)

	defer bot.Close()

	fmt.Println("the bot is online")

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	log.Println("Press Ctrl+C to exit")
	<-stop

	log.Println("Gracefully shutting down.")
}
