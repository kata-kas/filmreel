package commands

import (
	"encoding/json"
	"fmt"
	"net/url"
	"path"
	"strings"

	"github.com/bwmarrin/discordgo"
	"github.com/kata-kas/filmreel/store"
	"gorm.io/gorm"
)

func (c *commands) AnnounceCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	options := i.ApplicationCommandData().Options
	optionMap := make(map[string]*discordgo.ApplicationCommandInteractionDataOption, len(options))
	for _, opt := range options {
		optionMap[opt.Name] = opt
	}

	movieLink := optionMap["letterboxd-link"].StringValue()

	// Acknowledge the interaction with a defer response
	if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
	}); err != nil {
		fmt.Println("error responding to interaction:", err)
		return
	}

	// Perform the time-consuming task
	embeds, genreRoles, genreRolesIds, err := c.announceLb(movieLink)
	if err != nil {
		// Handle the error appropriately, e.g., log it and respond with an error message
		fmt.Println("error processing announcement:", err)
		// Optionally send an error message to the user if necessary
		errMsg := "There was an error processing your request."
		if _, err := s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{
			Content: &errMsg,
		}); err != nil {
			fmt.Println("error editing response:", err)
		}
		return
	}

	// Follow up with the result after processing
	if _, err := s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{
		Embeds:          embeds,
		Content:         &genreRoles,
		AllowedMentions: &discordgo.MessageAllowedMentions{Roles: genreRolesIds},
	}); err != nil {
		fmt.Println("error editing response:", err)
	}
}

func (c *commands) announceLb(movieLink string) (*[]*discordgo.MessageEmbed, string, []string, error) {
	parsedURL, err := url.Parse(movieLink)
	if err != nil {
		return nil, "", nil, err
	}
	movieId := path.Base(parsedURL.Path)

	movie, err := c.DB.SearchMovieByMovieId(movieId)
	if err != nil && err != gorm.ErrRecordNotFound {
		fmt.Println(err)
		return nil, "", nil, err
	}
	if err == gorm.ErrRecordNotFound {
		movie, err = c.LB.ScrapeMovie(movieLink)
		if err != nil {
			fmt.Printf("err: %v", err.Error())
			return nil, "", nil, err
		}
		c.DB.InsertMovies([]store.Movie{*movie})
		fmt.Printf("movie is: %v", &movie)
	}

	genreSlice := strings.Split(movie.Genres, ",")
	fmt.Printf("genre slice: %v", genreSlice)
	genreRoles := make([]string, 0)
	genreRolesIds := make([]string, 0)

	for _, genre := range genreSlice {
		roleID, exists := genreToRole[strings.TrimSpace(genre)]
		if exists {
			genreRoles = append(genreRoles, fmt.Sprintf("<@&%s>", roleID))
			genreRolesIds = append(genreRolesIds, roleID)
		}
	}

	streamingMessage := fmt.Sprintf("** Streaming %s (%d) now **\n", movie.MovieTitle, movie.YearReleased)
	streamingMessage += fmt.Sprintf("> Plot: %s\n", movie.Overview)
	streamingMessage += fmt.Sprintf("%s\n", strings.Join(genreRoles, ""))
	streamingMessage += movieLink

	fields := []*discordgo.MessageEmbedField{
		{
			Name:   "Average Rating",
			Value:  convertVoteAverageToMoons(movie.VoteAverage),
			Inline: true,
		},
		{
			Name:   "Genres",
			Value:  strings.Join(genreRoles, " "),
			Inline: true,
		},
	}
	image := &discordgo.MessageEmbedThumbnail{
		URL: movie.ImageURL,
	}

	movieJSON, err := json.Marshal(movie)
	if err != nil {
		fmt.Printf("Error encoding movie to JSON: %s\n", err)
		return nil, "", nil, nil
	}
	fmt.Printf("Encoded JSON: %s\n", string(movieJSON))

	embed := discordgo.MessageEmbed{
		Thumbnail:   image,
		Title:       fmt.Sprintf("** Streaming %s (%d) now **\n", movie.MovieTitle, movie.YearReleased),
		Description: fmt.Sprintf("> %s", string(movie.Overview)),
		Color:       0xFFD700,
		Fields:      fields,
		URL:         movieLink,
	}

	embeds := []*discordgo.MessageEmbed{&embed}
	return &embeds, fmt.Sprintf("%s\n", strings.Join(genreRoles, "")), genreRolesIds, nil
}

func convertVoteAverageToMoons(voteAverage float64) string {
	result := ""
	moonCount := 0
	moons := map[string]string{"full": " 🌕 ", "half": " 🌗 ", "empty": " 🌑 "}

	for i := 0; i < 5; i++ {
		if voteAverage >= 1 {
			result += moons["full"]
			voteAverage -= 1
		} else if voteAverage > 0 {
			if voteAverage+0.25 >= 1 {
				result += moons["full"]
			} else if voteAverage+0.25 >= 0.5 {
				result += moons["half"]
			} else {
				result += moons["empty"]
			}
			voteAverage -= voteAverage
		} else {
			result += moons["empty"]
		}
		moonCount++
	}

	// Remove the trailing space
	result = strings.TrimSpace(result)
	return result
}

var genreToRole = map[string]string{
	"Drama":           "1151634354171285567",
	"Arthouse":        "1150943285276323921",
	"Action":          "1150943487445966960",
	"Adventure":       "1158948435693674497",
	"Anime":           "1150944663855960074",
	"Animation":       "1150944712589578381",
	"Family":          "1150944935135170674",
	"Comedy":          "1150943537102327899",
	"Romance":         "1151261532974497813",
	"Crime":           "1150944774342324305",
	"Mystery":         "1151634419354980437",
	"Horror":          "1150943421956116600",
	"Western":         "1150945041938907147",
	"Science Fiction": "1150944976570695770",
	"Fantasy":         "1150944890822336593",
	"X-rated":         "1156248529807876126",
	"Documentary":     "1150944840561983589",
	"Riffer":          "1152154515311706183",
	"Sports":          "1152937330194268310",
	"Television":      "1152155260299780148",
}
