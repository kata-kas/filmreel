package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/libsql/libsql-client-go/libsql"
)

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
