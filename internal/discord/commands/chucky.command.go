package commands

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"

	"github.com/bwmarrin/discordgo"
)

type ResponseChuck struct {
	Joke string `json:"joke"`
}

func ChuckyCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	jokeEmbed := fetchChuckNorris()
	embeds := []*discordgo.MessageEmbed{&jokeEmbed}
	s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Embeds: embeds,
		},
	})
}

func fetchChuckNorris() discordgo.MessageEmbed {
	client := http.Client{}
	req, err := http.NewRequest("GET", "https://api.api-ninjas.com/v1/chucknorris?", nil)
	if err != nil {
		log.Fatal(err.Error())
	}
	req.Header.Add("X-Api-Key", "eUce+mtbT7vu0TcyQ+XOMA==qsrHoopebYE1cPxQ")

	resp, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
	}

	responseData, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Fatal(err)
	}

	var responseObject ResponseChuck
	json.Unmarshal(responseData, &responseObject)

	author := discordgo.MessageEmbedAuthor{
		Name: "Chuck Norris",
	}
	image := &discordgo.MessageEmbedImage{
		URL: "https://images.fineartamerica.com/images/artworkimages/mediumlarge/2/chuck-norris-stars-on-art.jpg",
	}
	embed := discordgo.MessageEmbed{
		Title:  responseObject.Joke,
		Author: &author,
		Image:  image,
	}

	return embed
}
