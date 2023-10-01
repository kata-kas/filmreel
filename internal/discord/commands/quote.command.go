package commands

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"

	"github.com/bwmarrin/discordgo"
)

type Response struct {
	Quote  string `json:"quote"`
	Author string `json:"author`
}

func QuoteCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	quoteEmbed := fetchQuote()
	embeds := []*discordgo.MessageEmbed{&quoteEmbed}
	s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Embeds: embeds,
		},
	})
}

func fetchQuote() discordgo.MessageEmbed {
	client := http.Client{}
	req, err := http.NewRequest("GET", os.Getenv("QUOTES_URL"), nil)
	if err != nil {
		log.Fatal(err.Error())
	}
	req.Header.Add("X-Api-Key", os.Getenv("NINJAAPI_TOKEN"))

	resp, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
	}

	responseData, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Fatal(err)
	}

	var responseObject []Response
	json.Unmarshal(responseData, &responseObject)

	quote := responseObject[0]

	author := discordgo.MessageEmbedAuthor{
		Name: quote.Author,
	}
	embed := discordgo.MessageEmbed{
		Title:  quote.Quote,
		Author: &author,
	}

	return embed
}
