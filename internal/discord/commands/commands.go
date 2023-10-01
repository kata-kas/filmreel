package commands

import (
	"github.com/bwmarrin/discordgo"
)

var commandDescriptions = []*discordgo.ApplicationCommand{
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
		Description: "Chuck Norris jokes",
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
}

func RegisterCommands(bot *discordgo.Session) {
	bot.AddHandler(func(s *discordgo.Session, i *discordgo.InteractionCreate) {
		if h, ok := commandHandlers[i.ApplicationCommandData().Name]; ok {
			h(s, i)
		}
	})
}
