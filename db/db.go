package db

import (
	"fmt"
	"log"
	"os"

	libsql "github.com/renxzen/gorm-libsql"
	_ "github.com/tursodatabase/libsql-client-go/libsql"
	"gorm.io/gorm"
)

var db *gorm.DB

func InitializeDatabase() error {
	database, err := gorm.Open(libsql.Open(os.Getenv("DB_URL")), &gorm.Config{})
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open db %s: %s", os.Getenv("DB_URL"), err)
		log.Fatal(err)
		return err
	}

	db = database

	err = db.AutoMigrate(&Movie{}, &User{}, &Rating{}, &ServerRating{})
	if err != nil {
		return err
	}

	return nil
}
