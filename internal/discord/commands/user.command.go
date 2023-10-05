package commands

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/bwmarrin/discordgo"
	"github.com/kata-kas/katabot/internal/db"
	"github.com/kata-kas/katabot/internal/letterboxd"
)

func AddUserCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	options := i.ApplicationCommandData().Options
	optionMap := make(map[string]*discordgo.ApplicationCommandInteractionDataOption, len(options))
	for _, opt := range options {
		optionMap[opt.Name] = opt
	}

	link := optionMap["letterboxd-link"].StringValue()
	// remove the last / in the link if it's present
	if strings.HasSuffix(link, "/") {
		link = link[:len(link)-1]
	}
	username := link[strings.LastIndex(link, "/")+1:]

	_, err := db.GetUserByUsername(username)
	if err == nil {
		s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "User " + username + " is already in our database, don't be a dumbo.",
			},
		})
	}

	user, error := letterboxd.ScrapeUser(username)

	if error != nil {
		fmt.Printf("scraping user error: %s", error)
		s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "User " + username + " doesn't exist, don't be a dumbo.",
			},
		})
	}

	dbUser := db.LetterboxdUserToDBUser(user)
	addUserErr := db.AddUser(&dbUser)
	if addUserErr != nil {
		fmt.Println(err)
	}

	interaction := ShowUser(s, i, username)
	s.InteractionRespond(i.Interaction, &interaction)
}

func ShowUser(s *discordgo.Session, i *discordgo.InteractionCreate, username string) discordgo.InteractionResponse {
	user, error := db.GetUserByUsername(username)
	if error != nil {
		fmt.Printf("show user error: %s", error)
		return discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "User " + username + " doesn't exist, don't be a dumbo.",
			},
		}
	}

	fields := []*discordgo.MessageEmbedField{
		{
			Name:   "General Stats",
			Inline: true,
		},
		{
			Name:   "Value",
			Inline: true,
		},
		{
			Name:   "Rank",
			Inline: true,
		},
		{
			Value:  "Movies seen",
			Inline: true,
		},
		{
			Value:  strconv.FormatInt(int64(user.TotalMovies), 10),
			Inline: true,
		},
		{
			Value:  "0",
			Inline: true,
		},
	}

	image := &discordgo.MessageEmbedThumbnail{
		URL: user.ImageUrl,
	}
	embed := discordgo.MessageEmbed{
		Thumbnail: image,
		Title:     user.Name,
		Fields:    fields,
		Color:     0xFF5733,
	}
	return discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Embeds: []*discordgo.MessageEmbed{&embed},
		},
	}
}
