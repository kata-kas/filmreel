package store

import "gorm.io/gorm"

type ServerRating struct {
	gorm.Model
	MovieID       uint
	AverageRating float64
	TotalRatings  uint
}

// Function to calculate and update server ratings for a movie
func (s *Store) UpdateServerRating(movieID uint) error {
	var serverRating struct {
		AverageRating float64
		TotalRatings  uint
	}

	// Calculate the average rating for the movie
	if err := s.db.Model(&Rating{}).Where("movie_id = ?", movieID).Select("AVG(rating) as average_rating, COUNT(*) as total_ratings").Scan(&serverRating).Error; err != nil {
		return err
	}

	// Check if the server rating for the movie already exists
	var existingRating ServerRating
	if err := s.db.Where("movie_id = ?", movieID).First(&existingRating).Error; err != nil {
		if err != gorm.ErrRecordNotFound {
			return err
		}
		// Create a new server rating entry
		newRating := ServerRating{
			MovieID:       movieID,
			AverageRating: serverRating.AverageRating,
			TotalRatings:  serverRating.TotalRatings,
		}
		if err := s.db.Create(&newRating).Error; err != nil {
			return err
		}
	} else {
		// Update the existing server rating entry
		if err := s.db.Model(&existingRating).Updates(ServerRating{AverageRating: serverRating.AverageRating, TotalRatings: serverRating.TotalRatings}).Error; err != nil {
			return err
		}
	}

	return nil
}

// Function to get the server rating for a movie
func (s *Store) GetServerRating(movieID uint) (*ServerRating, error) {
	var serverRating ServerRating
	if err := s.db.Where("movie_id = ?", movieID).First(&serverRating).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &serverRating, nil
}
