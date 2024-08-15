package letterboxd

import (
	"errors"
	"fmt"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-rod/rod"
	"github.com/go-rod/stealth"
	"github.com/gocolly/colly"
	"github.com/kata-kas/filmreel/store"
)

type LB struct {
	B  *rod.Browser
	DB *store.Store
}

func NewLB(browser *rod.Browser, db *store.Store) *LB {
	return &LB{browser, db}
}

func (lb *LB) ScrapeUser(username string) (User, error) {
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

func (lb *LB) ScrapeMovie(movieURL string) (*store.Movie, error) {
	page := stealth.MustPage(lb.B)
	page.MustNavigate(movieURL)
	page.MustWaitLoad()
	page.MustWaitDOMStable()

	parsedURL, err := url.Parse(movieURL)
	if err != nil {
		fmt.Printf("Error parsing movie url %s", movieURL)
		return nil, err
	}
	movieId := path.Base(parsedURL.Path)

	movieTitle := page.MustElement("h1.headline-1").MustText()
	var genres []string
	genresXPath := `//div[@id='tab-genres']//div[@class='text-sluglist capitalize'][1]//p/a[@class='text-slug']`
	genresElements := page.MustElementsX(genresXPath)
	for _, genreEl := range genresElements {
		genre := genreEl.MustText()
		fmt.Printf("genre: %s", genre)
		genres = append(genres, genre)
	}

	posterImg := page.MustElement(`div.react-component.poster img`)
	imageURL, _ := posterImg.Attribute("src")

	coverImgURL := page.MustElementX(`//div[@class='backdrop-container']/div[@id='backdrop']/@data-backdrop`).MustText()

	imdbLinkElem := page.MustElementX("//a[contains(@href, 'imdb.com/title/')]/@href")
	imdbLink := imdbLinkElem.MustText()
	imdbID := strings.TrimSpace(strings.TrimPrefix(strings.TrimSuffix(imdbLink, "/maindetails"), "http://www.imdb.com/title/tt"))
	tmdbLinkElem := page.MustElementX("//a[contains(@href, 'themoviedb.org/movie/')]/@href")
	tmdbLink := tmdbLinkElem.MustText()
	tmdbID := lb.extractTmdbID(tmdbLink)
	tmdbIDInt, err := strconv.Atoi(strings.TrimSpace(tmdbID))
	if err != nil {
		fmt.Printf("error converting tmdbid to int: %v", err.Error())
		return nil, err
	}
	language := page.MustElement("#tab-details .text-sluglist:nth-of-type(3) .text-slug").MustText()
	fmt.Printf("language %s \n", language)
	overview := page.MustElementX(`//div[@class='review body-text -prose -hero prettify']//div[contains(@class, 'truncate')][1]//p/text()`).MustText()
	fmt.Printf("overview: %s \n", overview)
	countriesDetails := page.MustElementX(`//div[@id='tab-details']//h3[span='Country' or span='Countries']/following-sibling::div[@class='text-sluglist']//a`)
	countriesDetailsText := countriesDetails.MustText()
	releaseDate := page.MustElementX(`//div[@id='tab-releases']//h5[@class='date']`)
	releaseDateText := releaseDate.MustText()
	runtimeElem := page.MustElementX(`//p[@class='text-link text-footer']/text()[1]`)
	runtimeText := strings.TrimSpace(runtimeElem.MustText())
	runtimeMinutes, err := lb.extractRuntimeMinutes(runtimeText)
	if err != nil {
		fmt.Println("Error extracting runtime:", err)
	}
	languagesElem := page.MustElementsX(`//h3[span/text()='Language']/following-sibling::div[contains(@class, 'text-sluglist')]/p/a`)
	var languages []string
	for _, lang := range languagesElem {
		languages = append(languages, lang.MustText())
	}
	voteAverageElem := page.MustElementX(`//section[@class='section ratings-histogram-chart']//span[@class='average-rating']//a/text()`)
	voteAverageText := voteAverageElem.MustText()
	voteAverage, err := strconv.ParseFloat(voteAverageText, 64)
	if err != nil {
		fmt.Println("Error parsing VoteAverage:", err)
		return nil, err
	}
	voteCountElem := page.MustElementX(`//ul[@class='film-stats']//li[contains(@class, 'filmstat-watches')]//a/text()`)
	voteCountTextWithoutK := strings.ReplaceAll(voteCountElem.MustText(), "K", "000")
	voteCountTextWithoutM := strings.ReplaceAll(voteCountTextWithoutK, "M", "000000")
	voteCountTextWithoutDots := strings.ReplaceAll(voteCountTextWithoutM, ".", "")
	voteCount, err := strconv.Atoi(voteCountTextWithoutDots)
	if err != nil {
		fmt.Println("Error parsing VoteCount:", err)
		return nil, err
	}

	yearReleasedElem := page.MustElementX(`//div[@class='releaseyear']/a/text()`)
	yearReleasedText := yearReleasedElem.MustText()
	yearReleased, err := strconv.Atoi(yearReleasedText)
	if err != nil {
		fmt.Println("Error parsing YearReleased:", err)
		return nil, err
	}

	watchesElem := page.MustElementX(`//ul[@class='film-stats']//li[contains(@class, 'filmstat-watches')]//a/text()`)
	watchesTextWithoutK := strings.ReplaceAll(watchesElem.MustText(), "K", "000")
	watchesTextWithoutM := strings.ReplaceAll(watchesTextWithoutK, "M", "000000")
	watchesTextWithoutDots := strings.ReplaceAll(watchesTextWithoutM, ".", "")
	watches, err := strconv.ParseFloat(watchesTextWithoutDots, 64)
	if err != nil {
		fmt.Println("Error parsing watches:", err)
		return nil, err
	}

	movie := &store.Movie{
		Genres:              strings.Join(genres, `","`),
		ImageURL:            *imageURL,
		CoverImageURL:       coverImgURL,
		IMDbID:              imdbID,
		IMDbLink:            imdbLink,
		MovieID:             movieId,
		MovieTitle:          movieTitle,
		OriginalLanguage:    language,
		Overview:            overview,
		Popularity:          watches,
		ProductionCountries: countriesDetailsText,
		ReleaseDate:         releaseDateText,
		Runtime:             runtimeMinutes,
		SpokenLanguages:     strings.Join(languages, `","`),
		TmdbID:              tmdbIDInt,
		TmdbLink:            tmdbLink,
		VoteAverage:         voteAverage,
		VoteCount:           voteCount,
		YearReleased:        yearReleased,
	}

	return movie, nil
}

func (lb *LB) extractRuntimeMinutes(runtimeText string) (int, error) {
	// Regex to find the numeric part of the runtime
	re := regexp.MustCompile(`\d+`)
	matches := re.FindStringSubmatch(runtimeText)

	if len(matches) == 0 {
		// No numbers found in the string
		return 0, fmt.Errorf("no numeric value found in runtime text")
	}

	// Convert the extracted string to an integer
	minutes, err := strconv.Atoi(matches[0])
	if err != nil {
		return 0, err
	}
	return minutes, nil
}

// extractTmdbID extracts the TMDb ID from the TMDb link
func (lb *LB) extractTmdbID(tmdbLink string) string {
	// Split the TMDb link by '/' and extract the ID
	parts := strings.Split(tmdbLink, "/")
	if len(parts) > 0 {
		return parts[len(parts)-2] // The ID is the second-to-last part
	}
	return ""
}

func (lb *LB) LetterboxdUserToDBUser(src User) *store.User {
	return &store.User{
		LbUsername:  src.LbUsername,
		Name:        src.Name,
		TotalMovies: int(src.TotalMovies),
		ImageUrl:    src.ImageUrl,
	}
}
