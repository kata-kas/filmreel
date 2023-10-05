package commands

import (
	"log"

	"github.com/bwmarrin/discordgo"
)

var commandStructure = []*discordgo.ApplicationCommand{
	{
		Name:        "basic-command",
		Description: "Basic command",
	},
	{
		Name:        "quote-me-daddy",
		Description: "Quote me, Daddy, uwu",
	},
	{
		Name:        "chucky",
		Description: "Chuck jokes",
	},
	{
		Name:        "add-user",
		Description: "Add user",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "letterboxd-link",
				Description: "Letterboxd link",
				Required:    true,
			},
		},
	},
	{
		Name:        "top",
		Description: "Show top of most movies watched",
	},
	{
		Name:        "movie",
		Description: "Find a movie",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "movie-title",
				Description: "Movie Title",
				Required:    true,
			},
		},
	},
	{
		Name:        "announce",
		Description: "Announce a stream using a Letterboxd link",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "letterboxd-link",
				Description: "Letterboxd Link",
				Required:    true,
			},
		},
	},
}

var commandHandlers = map[string]func(s *discordgo.Session, i *discordgo.InteractionCreate){
	"basic-command": func(s *discordgo.Session, i *discordgo.InteractionCreate) {
		s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "Hey there! Congratulations, you just executed our first slash command",
			},
		})
	},
	"quote-me-daddy": QuoteCommand,
	"chucky":         ChuckyCommand,
	"add-user":       AddUserCommand,
	"top":            TopCommand,
	"movie":          MovieCommand,
	"announce":       AnnounceCommand,
}

func RegisterCommands(bot *discordgo.Session) {
	bot.AddHandler(func(s *discordgo.Session, i *discordgo.InteractionCreate) {
		if h, ok := commandHandlers[i.ApplicationCommandData().Name]; ok {
			h(s, i)
		}
	})
	for _, v := range commandStructure {
		_, err := bot.ApplicationCommandCreate(bot.State.User.ID, "", v)
		if err != nil {
			log.Panicf("Cannot create '%v' command: %v", v.Name, err)
		}
	}
}
