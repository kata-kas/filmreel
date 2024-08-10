DROP TABLE IF EXISTS movies;

CREATE TABLE
    movies (
        _id INTEGER PRIMARY KEY AUTOINCREMENT,
        genres TEXT,
        image_url TEXT,
        imdb_id TEXT,
        imdb_link TEXT,
        movie_id TEXT UNIQUE,
        movie_title TEXT,
        original_language TEXT,
        overview TEXT,
        popularity REAL,
        production_countries TEXT,
        release_date TEXT,
        runtime INTEGER,
        spoken_languages TEXT,
        tmdb_id INTEGER,
        tmdb_link TEXT,
        vote_average REAL,
        vote_count INTEGER,
        year_released INTEGER
    );