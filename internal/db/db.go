package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"

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
