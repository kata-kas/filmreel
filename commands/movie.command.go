package commands

import (
	"fmt"
	"strconv"

	"github.com/bwmarrin/discordgo"
	"github.com/kata-kas/filmreel/letterboxd"
)

func (c *commands) MovieCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	options := i.ApplicationCommandData().Options
	optionMap := make(map[string]*discordgo.ApplicationCommandInteractionDataOption, len(options))
	for _, opt := range options {
		optionMap[opt.Name] = opt
	}

	movieTitle := optionMap["movie-title"].StringValue()

	movie, err := c.DB.SearchMovie(movieTitle)
	if err != nil {
		fmt.Println(err)
		s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "Movie " + movieTitle + " could not be found.",
			},
		})
	}

	fields := []*discordgo.MessageEmbedField{
		{
			Name:   "Average Rating",
			Value:  strconv.FormatFloat(movie.VoteAverage, 'f', 0, 64),
			Inline: true,
		},
		{
			Name:   "Genres",
			Value:  movie.Genres,
			Inline: true,
		},
	}

	image := &discordgo.MessageEmbedThumbnail{
		URL: letterboxd.LB_IMG_URL + movie.ImageURL + ".jpg",
	}
	embed := discordgo.MessageEmbed{
		Thumbnail:   image,
		Title:       movie.MovieTitle + " (" + strconv.FormatInt(int64(movie.YearReleased), 10) + ")",
		Description: movie.Overview,
		Color:       0xFFD700,
		Fields:      fields,
		URL:         letterboxd.LB_FILM_URL + movie.MovieID,
	}

	embeds := []*discordgo.MessageEmbed{&embed}
	interactionErr := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Embeds: embeds,
		},
	})

	if interactionErr != nil {
		fmt.Println(interactionErr)
	}
}
