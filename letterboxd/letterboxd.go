package letterboxd

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/gocolly/colly"
)

func ScrapeUser(username string) (User, error) {
	result := User{
		LbUsername: username,
	}
	var resultError error
	c := colly.NewCollector()

	c.OnHTML("body.error", func(h *colly.HTMLElement) {
		resultError = errors.New("No such user")
	})

	c.OnHTML("div.profile-summary", func(h *colly.HTMLElement) {
		h.ForEach("div.profile-info div.profile-stats h4.profile-statistic a", func(i int, h *colly.HTMLElement) {
			if h.ChildText("span.definition") == "Films" {
				value := strings.ReplaceAll(h.ChildText("span.value"), ",", "")
				TotalMovies, error := strconv.ParseInt(value, 10, 16)
				result.TotalMovies = int16(TotalMovies)
				resultError = error
			}
		})
		result.ImageUrl = h.ChildAttr("div.profile-avatar span.avatar img", "src")
		result.Name = h.ChildText("div.profile-name div.profile-name-wrap h1")
	})

	c.OnRequest(func(r *colly.Request) {
		fmt.Println("Visiting", r.URL)
	})

	err := c.Visit(LB_BASE_URL + username)
	if err != nil {
		resultError = err
	}

	return result, resultError
}

func ScrapeFilms(username string) ([]*Rating, error) {
	results := []*Rating{}
	var resultError error
	c := colly.NewCollector()

	c.OnHTML("body.error", func(h *colly.HTMLElement) {
		resultError = errors.New("No such user")
	})

	c.OnHTML("ul.poster-list", func(h *colly.HTMLElement) {
		h.ForEach("li.poster-container", func(i int, h *colly.HTMLElement) {

		})
	})

	c.Visit(LB_BASE_URL + username + "/films/")

	return results, resultError
}
