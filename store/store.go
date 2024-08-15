package store

import (
	"fmt"
	"log"
	"os"

	"github.com/kata-kas/filmreel/utils"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var (
	POSTGRES_HOST     = utils.EnvString("POSTGRES_HOST", "")
	POSTGRES_USER     = utils.EnvString("POSTGRES_USER", "")
	POSTGRES_PASSWORD = utils.EnvString("POSTGRES_PASSWORD", "")
	POSTGRES_PORT     = utils.EnvString("POSTGRES_PORT", "")
	POSTGRES_DB       = utils.EnvString("POSTGRES_DB", "")
)

type Store struct {
	db *gorm.DB
}

func NewStore() *Store {
	db, err := InitializeDatabase()
	if err != nil {
		log.Fatal("Can't initialize Db")
	}
	return &Store{db}
}

func InitializeDatabase() (*gorm.DB, error) {
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable", POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT)
	database, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open db %s: %s", POSTGRES_DB, err)
		log.Fatal(err)
		return nil, err
	}

	db := database

	err = db.AutoMigrate(&Movie{}, &User{}, &Rating{}, &ServerRating{})
	if err != nil {
		return nil, err
	}

	return db, nil
}
