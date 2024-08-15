package letterboxd

const LB_BASE_URL = "https://letterboxd.com/"
const LB_IMG_URL = "https://a.ltrbxd.com/resized/"
const LB_FILM_URL = LB_BASE_URL + "film/"

type User struct {
	LbUsername  string
	Name        string
	TotalMovies int16
	ImageUrl    string
}

type Movie struct {
	lbSlug string
	name   string
	poster string
}

type Rating struct {
	reviewerLbUsername string
	movieLbSlug        string
	value              int8
}
