package commands

import (
	"fmt"
	"log"

	"github.com/bwmarrin/discordgo"
)

var commandStructure = []*discordgo.ApplicationCommand{
	{
		Name:        "ping",
		Description: "ping",
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
	"ping": func(s *discordgo.Session, i *discordgo.InteractionCreate) {
		s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "pong",
			},
		})
	},
	"add-user": AddUserCommand,
	"top":      TopCommand,
	"movie":    MovieCommand,
	"announce": AnnounceCommand,
}

func guildMemberUpdate(s *discordgo.Session, m *discordgo.GuildMemberUpdate) {
	roleName := "-18"
	fmt.Printf("member %s joined\n", m.User.Username)
	roles, err := s.GuildRoles(m.GuildID)
	if err != nil {
		log.Printf("error fetching roles: %v", err)
		return
	}

	var roleID string
	for _, role := range roles {
		if role.Name == roleName {
			roleID = role.ID
			break
		}
	}

	if roleID == "" {
		log.Printf("role %s not found", roleName)
		return
	}

	fmt.Printf("user roles %v\n", m.Roles)
	for _, memberRoleID := range m.Roles {
		if memberRoleID == roleID {
			// Kick the member
			err := s.GuildMemberDeleteWithReason(m.GuildID, m.User.ID, "USER WAS A MINOR")
			if err != nil {
				log.Printf("error kicking user %s: %v", m.User.Username, err)
			} else {
				log.Printf("kicked user %s with role %s", m.User.Username, roleName)
			}
			return
		}
	}
}

func RegisterCommands(bot *discordgo.Session) {
	bot.AddHandler(guildMemberUpdate)
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
