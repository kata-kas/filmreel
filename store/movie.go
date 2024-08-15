package store

import (
	"fmt"

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

func (s *Store) InsertMovies(movies []Movie) error {
	tx := s.db.Begin()
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

func (s *Store) SearchMovie(title string) (*Movie, error) {
	var movie Movie
	if err := s.db.Where("movie_title LIKE ?", "%"+title+"%").First(&movie).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("No movie found for title: %s", title)
		}
		return nil, err
	}
	return &movie, nil
}

func (s *Store) SearchMovieByMovieId(movieId string) (*Movie, error) {
	var movie Movie
	if err := s.db.Where("movie_id = ?", movieId).First(&movie).Error; err != nil {
		return nil, err
	}
	return &movie, nil
}
