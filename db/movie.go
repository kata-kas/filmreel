package db

import (
	"fmt"
	"strconv"

	"github.com/kata-kas/filmreel/utils"
	"gorm.io/gorm"
)

type Movie struct {
	Genres              string  `json:"genres"`
	ImageURL            string  `json:"image_url"`
	IMDbID              string  `json:"imdb_id"`
	IMDbLink            string  `json:"imdb_link"`
	MovieID             string  `json:"movie_id"`
	MovieTitle          string  `json:"movie_title"`
	OriginalLanguage    string  `json:"original_language"`
	Overview            string  `json:"overview"`
	Popularity          float64 `json:"popularity"`
	ProductionCountries string  `json:"production_countries"`
	ReleaseDate         string  `json:"release_date"`
	Runtime             int     `json:"runtime"`
	SpokenLanguages     string  `json:"spoken_languages"`
	TmdbID              int     `json:"tmdb_id"`
	TmdbLink            string  `json:"tmdb_link"`
	VoteAverage         float64 `json:"vote_average"`
	VoteCount           int     `json:"vote_count"`
	YearReleased        int     `json:"year_released"`
}

func InsertMovies(movies []Movie) error {
	tx := db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Create(&movies).Error; err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit().Error
}

func SearchMovie(title string) (*Movie, error) {
	var movie Movie
	if err := db.Where("movie_title LIKE ?", "%"+title+"%").First(&movie).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("No movie found for title: %s", title)
		}
		return nil, err
	}
	return &movie, nil
}

func SearchMovieByMovieId(movieId string) (*Movie, error) {
	var movie Movie
	if err := db.Where("movie_id = ?", movieId).First(&movie).Error; err != nil {
		return nil, err
	}
	return &movie, nil
}

func parseMovie(line []string) (*Movie, error) {
	safeParseFloat := func(s string) (float64, error) {
		if s == "null" || s == "" {
			return 0.0, nil
		}
		return strconv.ParseFloat(s, 64)
	}
	safeAtoi := func(s string) int {
		if s == "null" || s == "" {
			return 0
		}
		val, _ := strconv.Atoi(s)
		return val
	}
	runtime := safeAtoi(line[12])
	voteCount := safeAtoi(line[17])
	yearReleased := safeAtoi(line[18])
	tmdbID := safeAtoi(line[14])

	popularity, err := safeParseFloat(line[9])
	if err != nil {
		return nil, err
	}

	voteAverage, err := safeParseFloat(line[16])
	if err != nil {
		return nil, err
	}

	movie := Movie{
		Genres:              utils.ParseStringArrayField(line[1]),
		ImageURL:            line[2],
		IMDbID:              line[3],
		IMDbLink:            line[4],
		MovieID:             line[5],
		MovieTitle:          line[6],
		OriginalLanguage:    line[7],
		Overview:            line[8],
		Popularity:          popularity,
		ProductionCountries: utils.ParseStringArrayField(line[10]),
		ReleaseDate:         line[11],
		Runtime:             runtime,
		SpokenLanguages:     utils.ParseStringArrayField(line[13]),
		TmdbID:              tmdbID,
		TmdbLink:            line[15],
		VoteAverage:         voteAverage,
		VoteCount:           voteCount,
		YearReleased:        yearReleased,
	}

	return &movie, nil
}
