package store

import "gorm.io/gorm"

type Rating struct {
	gorm.Model
	UserID    uint
	MovieID   uint
	Rating    float64
	Timestamp int64
}

// Function to insert ratings into the database
func (s *Store) InsertRatings(ratings []Rating) error {
	// Begin a transaction
	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Insert ratings into the database
	if err := tx.Create(&ratings).Error; err != nil {
		tx.Rollback()
		return err
	}

	// Commit the transaction
	return tx.Commit().Error
}

// Function to retrieve ratings for a movie
func (s *Store) GetRatingsForMovie(movieID uint) ([]Rating, error) {
	var ratings []Rating
	if err := s.db.Where("movie_id = ?", movieID).Find(&ratings).Error; err != nil {
		return nil, err
	}
	return ratings, nil
}

// Function to retrieve ratings given by a user
func (s *Store) GetRatingsByUser(userID uint) ([]Rating, error) {
	var ratings []Rating
	if err := s.db.Where("user_id = ?", userID).Find(&ratings).Error; err != nil {
		return nil, err
	}
	return ratings, nil
}

// Function to calculate the average rating for a movie
func (s *Store) CalculateAverageRatingForMovie(movieID uint) (float64, error) {
	var averageRating float64
	if err := s.db.Model(&Rating{}).Where("movie_id = ?", movieID).Select("AVG(rating)").Scan(&averageRating).Error; err != nil {
		return 0, err
	}
	return averageRating, nil
}