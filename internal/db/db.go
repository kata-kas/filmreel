package db

import (
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/kata-kas/katabot/internal/letterboxd"
	_ "github.com/libsql/libsql-client-go/libsql"
)

type User struct {
	ID          int
	LbUsername  string
	Name        string
	TotalMovies int
	ImageUrl    string
}

var db *sql.DB

func InitializeDatabase() error {
	database, err := sql.Open("libsql", os.Getenv("DB_URL"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open db %s: %s", os.Getenv("DB_URL"), err)
		log.Fatal(err)
		return err
	}

	db = database

	return nil
}

func GetUserByUsername(username string) (*User, error) {
	query := "SELECT id, lb_username, name, total_movies, image_url FROM user WHERE lb_username = ?"

	rows, err := db.Query(query, username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if rows.Next() {
		var user User
		if err := rows.Scan(&user.ID, &user.LbUsername, &user.Name, &user.TotalMovies, &user.ImageUrl); err != nil {
			return nil, err
		}
		return &user, nil
	}

	return nil, fmt.Errorf("user with username '%s' not found", username)
}

func AddUser(user *User) error {
	query := "INSERT INTO user (lb_username, name, total_movies, image_url) VALUES (?, ?, ?, ?)"

	_, err := db.Query(query, user.LbUsername, user.Name, user.TotalMovies, user.ImageUrl)
	if err != nil {
		fmt.Errorf("errorrere: %s", err)
		return err
	}

	return nil
}

func GetTopByTotalMovies() ([]*User, error) {
	query := "SELECT * FROM user ORDER BY total_movies DESC"
	users := make([]*User, 0)
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		user := new(User)
		if err := rows.Scan(&user.ID, &user.LbUsername, &user.Name, &user.TotalMovies, &user.ImageUrl); err != nil {
			return nil, err
		}
		users = append(users, user)
	}

	return users, nil
}

func LetterboxdUserToDBUser(src letterboxd.User) User {
	return User{
		LbUsername:  src.LbUsername,
		Name:        src.Name,
		TotalMovies: int(src.TotalMovies),
		ImageUrl:    src.ImageUrl,
	}
}

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

	fmt.Println(len(movie.MovieTitle))
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

func ParseCsv(filePath string) ([]Movie, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}

	defer file.Close()

	reader := csv.NewReader(file)
	lines, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	var movies []Movie
	var wg sync.WaitGroup
	movieChan := make(chan Movie)

	for idx, line := range lines {
		if idx == 0 {
			continue
		}

		wg.Add(1)
		go func(line []string) {
			defer wg.Done()

			movie, err := parseMovie(line)
			if err != nil {
				fmt.Println(err)
				return
			}

			movieChan <- *movie
		}(line)
	}

	go func() {
		wg.Wait()
		close(movieChan)
	}()

	for movie := range movieChan {
		movies = append(movies, movie)
	}

	return movies, nil
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
		Genres:              parseStringArrayField(line[1]),
		ImageURL:            line[2],
		IMDbID:              line[3],
		IMDbLink:            line[4],
		MovieID:             line[5],
		MovieTitle:          line[6],
		OriginalLanguage:    line[7],
		Overview:            line[8],
		Popularity:          popularity,
		ProductionCountries: parseStringArrayField(line[10]),
		ReleaseDate:         line[11],
		Runtime:             runtime,
		SpokenLanguages:     parseStringArrayField(line[13]),
		TmdbID:              tmdbID,
		TmdbLink:            line[15],
		VoteAverage:         voteAverage,
		VoteCount:           voteCount,
		YearReleased:        yearReleased,
	}

	return &movie, nil
}

func parseStringArrayField(input string) string {
	// Clean up the JSON string
	cleaned := strings.Trim(input, "[]\"")

	parts := strings.Split(cleaned, `","`)

	result := make([]string, len(parts))

	for i, part := range parts {
		result[i] = strings.ReplaceAll(part, `""`, `"`)
	}

	return strings.Join(result, ";")
}
