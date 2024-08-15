package store

import (
	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	LbUsername  string
	Name        string
	TotalMovies int
	ImageUrl    string
}

func (s *Store) GetUserByUsername(username string) (*User, error) {
	var user User
	if err := s.db.Where("lb_username = ?", username).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func (s *Store) GetTopByTotalMovies() ([]*User, error) {
	var users []*User
	if err := s.db.Order("total_movies DESC").Find(&users).Error; err != nil {
		return nil, err
	}
	return users, nil
}

func (s *Store) AddUser(user *User) error {
	if err := s.db.Create(user).Error; err != nil {
		return err
	}
	return nil
}
