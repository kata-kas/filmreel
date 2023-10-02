package commands

import (
	"fmt"
	"strconv"

	"github.com/bwmarrin/discordgo"
	"github.com/kata-kas/katabot/internal/db"
)

func TopCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	users, err := db.GetTopByTotalMovies()
	if err != nil {
		fmt.Println("error on TopCommand: %v\n", err)
	}

	fields := []*discordgo.MessageEmbedField{
		{
			Name:   "Username",
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
	}

	for idx, user := range users {
		usernameField := discordgo.MessageEmbedField{
			Value:  user.LbUsername,
			Inline: true,
		}
		valueField := discordgo.MessageEmbedField{
			Value:  strconv.FormatInt(int64(user.TotalMovies), 10),
			Inline: true,
		}
		rankField := discordgo.MessageEmbedField{
			Value:  strconv.FormatInt(int64(idx+1), 10),
			Inline: true,
		}
		fields = append(fields, &usernameField, &valueField, &rankField)
	}

	embed := discordgo.MessageEmbed{
		Title:  "Top Movies Seen",
		Fields: fields,
		Color:  0xFF5733,
	}
	embeds := []*discordgo.MessageEmbed{&embed}
	s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Embeds: embeds,
		},
	})
}
