package letterboxd

import (
	"context"
	"crypto/md5"
	"errors"
	"fmt"
	"log"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/stealth"
	"github.com/gocolly/colly"
	"github.com/kata-kas/filmreel/db"
)

type lb struct {
	B *rod.Browser
}

func NewLB() *lb {
	path, noPathErr := launcher.LookPath()
	if noPathErr != false {
		log.Println("Error looking for browser path")
	}

	debugUrl := launcher.New().
		Bin(path).
		Devtools(false).
		Headless(true).
		NoSandbox(true).
		MustLaunch()

	browser := rod.New().ControlURL(debugUrl).Timeout(time.Hour).MustConnect().Context(context.Background())
	browser.SlowMotion(time.Second * 1)
	defer browser.MustClose()
	fmt.Printf("js: %x\n\n", md5.Sum([]byte(stealth.JS)))

	return &lb{browser}
}

func (lb *lb) ScrapeUser(username string) (User, error) {
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

func (lb *lb) ScrapeMovie(movieURL string) (*db.Movie, error) {
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
	genresXPath := `//*[@id="tab-genres"]//div[@class="text-sluglist"]//a/text()`
	genresElements := page.MustElementsX(genresXPath)
	for _, genreEl := range genresElements {
		genre := genreEl.MustText()
		genres = append(genres, genre)
	}

	posterImg := page.MustElement(`div.react-component.poster img`)
	imageURL, _ := posterImg.Attribute("src")

	imdbLinkElem := page.MustElementX("//a[contains(@href, 'imdb.com/title/')]/@href")
	imdbLink := imdbLinkElem.MustText()
	imdbID := strings.TrimSpace(strings.TrimPrefix(strings.TrimSuffix(imdbLink, "/maindetails"), "http://www.imdb.com/title/tt"))
	tmdbLinkElem := page.MustElementX("//a[contains(@href, 'themoviedb.org/movie/')]/@href")
	tmdbLink := tmdbLinkElem.MustText()
	tmdbID := extractTmdbID(tmdbLink)
	tmdbIDInt, err := strconv.Atoi(strings.TrimSpace(tmdbID))
	if err != nil {
		fmt.Printf("error converting tmdbid to int: %v", err.Error())
		return nil, err
	}
	language := page.MustElement("#tab-details .text-sluglist:nth-of-type(3) .text-slug").MustText()
	overview := page.MustElement(".truncate.condenseable p").MustText()
	popularity := page.MustElement(".filmstat-watches a").MustText()
	countriesDetails := page.MustElementX("//div[@id='tab-details']//h3[span='Country']/following-sibling::div[@class='text-sluglist']//a")
	countriesDetailsText := countriesDetails.MustText()
	releaseDate := page.MustElementX("//div[@id='tab-releases']//h5[@class='date']")
	releaseDateText := releaseDate.MustText()
	runtimeElem := page.MustElementX("//p[@class='text-link text-footer']/text()[1]")
	runtimeText := strings.TrimSpace(runtimeElem.MustText())
	runtimeMinutes, err := extractRuntimeMinutes(runtimeText)
	if err != nil {
		fmt.Println("Error extracting runtime:", err)
		return nil, err
	}
	languagesElem := page.MustElementsX("//h3[span/text()='Language']/following-sibling::div[contains(@class, 'text-sluglist')]/p/a")
	var languages []string
	for _, lang := range languagesElem {
		languages = append(languages, lang.MustText())
	}
	voteAverageElem := page.MustElementX("//span[contains(@class, 'vote-average')]")
	voteAverageText := voteAverageElem.MustText()
	voteAverage, err := strconv.ParseFloat(voteAverageText, 64)
	if err != nil {
		fmt.Println("Error parsing VoteAverage:", err)
		return nil, err
	}
	voteCountElem := page.MustElementX("//span[contains(@class, 'vote-count')]")
	voteCountText := voteCountElem.MustText()
	voteCount, err := strconv.Atoi(voteCountText)
	if err != nil {
		fmt.Println("Error parsing VoteCount:", err)
		return nil, err
	}
	yearReleasedElem := page.MustElementX("//span[contains(@class, 'year-released')]")
	yearReleasedText := yearReleasedElem.MustText()
	yearReleased, err := strconv.Atoi(yearReleasedText)
	if err != nil {
		fmt.Println("Error parsing YearReleased:", err)
		return nil, err
	}

	popularityFloat64, err := strconv.ParseFloat(popularity, 64)
	if err != nil {
		fmt.Printf("error parsing popularity: %v", err.Error())
	}

	movie := &db.Movie{}
	movie.Genres = fmt.Sprintf(`["%s"]`, strings.Join(genres, `","`))
	movie.ImageURL = *imageURL
	movie.IMDbID = imdbID
	movie.IMDbLink = imdbLink
	movie.MovieID = movieId
	movie.MovieTitle = movieTitle
	movie.OriginalLanguage = language
	movie.Overview = overview
	movie.Popularity = popularityFloat64
	movie.ProductionCountries = countriesDetailsText
	movie.ReleaseDate = releaseDateText
	movie.Runtime = runtimeMinutes
	movie.SpokenLanguages = fmt.Sprintf(`["%s"]`, strings.Join(languages, `","`))
	movie.TmdbID = tmdbIDInt
	movie.TmdbLink = tmdbLink
	movie.VoteAverage = voteAverage
	movie.VoteCount = voteCount
	movie.YearReleased = yearReleased

	return movie, nil
}

func extractRuntimeMinutes(runtimeText string) (int, error) {
	// Regex to find the numeric part of the runtime
	re := regexp.MustCompile(`(\d+)\s*mins?`)
	matches := re.FindStringSubmatch(runtimeText)
	if len(matches) < 2 {
		return 0, fmt.Errorf("runtime format is incorrect")
	}
	// Convert the extracted string to an integer
	minutes, err := strconv.Atoi(matches[1])
	if err != nil {
		return 0, err
	}
	return minutes, nil
}

// extractTmdbID extracts the TMDb ID from the TMDb link
func extractTmdbID(tmdbLink string) string {
	// Split the TMDb link by '/' and extract the ID
	parts := strings.Split(tmdbLink, "/")
	if len(parts) > 0 {
		return parts[len(parts)-2] // The ID is the second-to-last part
	}
	return ""
}
