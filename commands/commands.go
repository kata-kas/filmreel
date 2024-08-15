package commands

import (
	"fmt"
	"log"

	"github.com/bwmarrin/discordgo"
	"github.com/kata-kas/filmreel/letterboxd"
	"github.com/kata-kas/filmreel/store"
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

type commands struct {
	DS *discordgo.Session
	DB *store.Store
	LB *letterboxd.LB
}

func NewCommands(ds *discordgo.Session, db *store.Store, lb *letterboxd.LB) *commands {
	return &commands{ds, db, lb}
}

func (c *commands) RegisterCommands() {
	commandHandlers := map[string]func(s *discordgo.Session, i *discordgo.InteractionCreate){
		"ping":     c.PingCommand,
		"add-user": c.AddUserCommand,
		"top":      c.TopCommand,
		"movie":    c.MovieCommand,
		"announce": c.AnnounceCommand,
	}

	c.DS.AddHandler(c.guildMemberUpdate)
	c.DS.AddHandler(func(s *discordgo.Session, i *discordgo.InteractionCreate) {
		if h, ok := commandHandlers[i.ApplicationCommandData().Name]; ok {
			h(s, i)
		}
	})
	for _, v := range commandStructure {
		_, err := c.DS.ApplicationCommandCreate(c.DS.State.User.ID, "", v)
		if err != nil {
			log.Panicf("Cannot create '%v' command: %v", v.Name, err)
		}
	}
}

func (c *commands) guildMemberUpdate(s *discordgo.Session, m *discordgo.GuildMemberUpdate) {
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
