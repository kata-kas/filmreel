package db

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"

	"github.com/kata-kas/katabot/bin/parsing"
)

type Movie struct {
	ID                  string  `json:"_id"`
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
	insertSQL := `
	INSERT INTO movies (
		genres, image_url, imdb_id, imdb_link, movie_id,
		movie_title, original_language, overview, popularity,
		production_countries, release_date, runtime, spoken_languages,
		tmdb_id, tmdb_link, vote_average, vote_count, year_released
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	stmt, err := tx.Prepare(insertSQL)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, movie := range movies {
		_, err := stmt.ExecContext(
			context.Background(),
			movie.Genres,
			movie.ImageURL,
			movie.IMDbID,
			movie.IMDbLink,
			movie.MovieID,
			movie.MovieTitle,
			movie.OriginalLanguage,
			movie.Overview,
			movie.Popularity,
			movie.ProductionCountries,
			movie.ReleaseDate,
			movie.Runtime,
			movie.SpokenLanguages,
			movie.TmdbID,
			movie.TmdbLink,
			movie.VoteAverage,
			movie.VoteCount,
			movie.YearReleased,
		)
		if err != nil {
			if strings.Contains(err.Error(), "UNIQUE constraint failed") {
				continue
			} else {
				fmt.Println("Error inserting movie:")
				fmt.Printf("Movie: %s\n", movie.MovieTitle)
				return err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	return nil
}

func SearchMovie(title string) (*Movie, error) {
	query := `
        SELECT * FROM movies
        WHERE movie_title LIKE ? 
        ORDER BY vote_count DESC
        LIMIT 1
    `

	var movie Movie
	err := db.QueryRow(query, title, title, "%"+title+"%").Scan(
		&movie.ID,
		&movie.Genres,
		&movie.ImageURL,
		&movie.IMDbID,
		&movie.IMDbLink,
		&movie.MovieID,
		&movie.MovieTitle,
		&movie.OriginalLanguage,
		&movie.Overview,
		&movie.Popularity,
		&movie.ProductionCountries,
		&movie.ReleaseDate,
		&movie.Runtime,
		&movie.SpokenLanguages,
		&movie.TmdbID,
		&movie.TmdbLink,
		&movie.VoteAverage,
		&movie.VoteCount,
		&movie.YearReleased,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("No movie found for title: %s", title)
		}
		return nil, err
	}

	return &movie, nil
}

func SearchMovieByMovieId(movieId string) (*Movie, error) {
	query := `
        SELECT * FROM movies
        WHERE movie_id = ? 
        LIMIT 1
    `

	var movie Movie
	err := db.QueryRow(query, movieId).Scan(
		&movie.ID,
		&movie.Genres,
		&movie.ImageURL,
		&movie.IMDbID,
		&movie.IMDbLink,
		&movie.MovieID,
		&movie.MovieTitle,
		&movie.OriginalLanguage,
		&movie.Overview,
		&movie.Popularity,
		&movie.ProductionCountries,
		&movie.ReleaseDate,
		&movie.Runtime,
		&movie.SpokenLanguages,
		&movie.TmdbID,
		&movie.TmdbLink,
		&movie.VoteAverage,
		&movie.VoteCount,
		&movie.YearReleased,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("No movie found for id: %s", movieId)
		}
		return nil, err
	}

	if len(movie.MovieTitle) == 0 {
		return nil, fmt.Errorf("Movie %s is too new. We don't have enough data.", movieId)
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
		ID:                  line[0],
		Genres:              parsing.ParseStringArrayField(line[1]),
		ImageURL:            line[2],
		IMDbID:              line[3],
		IMDbLink:            line[4],
		MovieID:             line[5],
		MovieTitle:          line[6],
		OriginalLanguage:    line[7],
		Overview:            line[8],
		Popularity:          popularity,
		ProductionCountries: parsing.ParseStringArrayField(line[10]),
		ReleaseDate:         line[11],
		Runtime:             runtime,
		SpokenLanguages:     parsing.ParseStringArrayField(line[13]),
		TmdbID:              tmdbID,
		TmdbLink:            line[15],
		VoteAverage:         voteAverage,
		VoteCount:           voteCount,
		YearReleased:        yearReleased,
	}

	return &movie, nil
}
