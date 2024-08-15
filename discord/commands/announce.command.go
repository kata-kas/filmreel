package commands

import (
	"fmt"
	"net/url"
	"path"
	"strings"

	"github.com/bwmarrin/discordgo"
	"github.com/kata-kas/filmreel/db"
	"github.com/kata-kas/filmreel/letterboxd"
	"gorm.io/gorm"
)

func AnnounceCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	options := i.ApplicationCommandData().Options
	optionMap := make(map[string]*discordgo.ApplicationCommandInteractionDataOption, len(options))
	for _, opt := range options {
		optionMap[opt.Name] = opt
	}

	movieLink := optionMap["letterboxd-link"].StringValue()

	interactionResponseData := announceLb(movieLink)
	s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &interactionResponseData,
	})
}

func announceLb(movieLink string) discordgo.InteractionResponseData {
	parsedURL, err := url.Parse(movieLink)
	if err != nil {
		return discordgo.InteractionResponseData{Content: err.Error()}
	}
	movieId := path.Base(parsedURL.Path)

	movie, err := db.SearchMovieByMovieId(movieId)
	if err != nil && err != gorm.ErrRecordNotFound {
		fmt.Println(err)
		return discordgo.InteractionResponseData{Content: fmt.Sprintf("no movie found for movie id: %s", movieId)}
	}
	if err == gorm.ErrRecordNotFound {
		letterboxd := letterboxd.NewLB()
		movie, err = letterboxd.ScrapeMovie(movieLink)
		if err != nil {
			fmt.Printf("err: %v", err.Error())
			return discordgo.InteractionResponseData{Content: fmt.Sprintf("no movie found for movie id: %s", movieId)}
		}
	}

	genreSlice := strings.Split(movie.Genres, ";")
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
		URL: letterboxd.LB_IMG_URL + movie.ImageURL + ".jpg",
	}
	embed := discordgo.MessageEmbed{
		Thumbnail:   image,
		Title:       fmt.Sprintf("** Streaming %s (%d) now **\n", movie.MovieTitle, movie.YearReleased),
		Description: fmt.Sprintf("> %s", movie.Overview),
		Color:       0xFFD700,
		Fields:      fields,
		URL:         movieLink,
	}

	embeds := []*discordgo.MessageEmbed{&embed}
	return discordgo.InteractionResponseData{
		Embeds:  embeds,
		Content: fmt.Sprintf("%s\n", strings.Join(genreRoles, "")),
		AllowedMentions: &discordgo.MessageAllowedMentions{
			Roles: genreRolesIds,
		},
	}
}

func convertVoteAverageToMoons(voteAverage float64) string {
	result := ""
	moonCount := 0
	voteAverage /= 2
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
