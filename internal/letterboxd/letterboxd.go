package letterboxd

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/gocolly/colly"
)

type User struct {
	LbUsername  string
	Name        string
	TotalMovies int16
	ImageUrl    string
}

func ScrapeUser(link string) (User, error) {
	result := User{
		LbUsername: link[strings.LastIndex(link, "/")+1:],
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

	err := c.Visit(link)
	if err != nil {
		resultError = err
	}

	return result, resultError
}
