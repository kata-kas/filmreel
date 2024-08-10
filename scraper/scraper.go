package scraper

import (
	"fmt"
	"sync"
	"time"

	"github.com/go-co-op/gocron"
	"github.com/gocolly/colly"
)

type ScraperJob struct {
	URL      string
	DataType string
}

type ScraperJobQueue struct {
	queue chan ScraperJob
}

func NewJobQueue(size int) *ScraperJobQueue {
	return &ScraperJobQueue{
		queue: make(chan ScraperJob, size),
	}
}

func StartJobQueue() *ScraperJobQueue {
	scraperJobQueue := NewJobQueue(100)

	const numWorkers = 5
	var wg sync.WaitGroup

	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go worker(i, scraperJobQueue, &wg)
	}

	return scraperJobQueue
}

func (sjq *ScraperJobQueue) ScheduleJob(job ScraperJob) {
	s := gocron.NewScheduler(time.UTC)
	_, err := s.Every(5).Seconds().Do(func() {
		job := ScraperJob{
			URL:      "https://letterboxd.com/film/killers-of-the-flower-moon/",
			DataType: "movie",
		}
		sjq.Enqueue(job)
	})

	if err != nil {
		fmt.Println("Error scheduling job:", err)
	}

	s.StartAsync()
}

func (sjq *ScraperJobQueue) Enqueue(job ScraperJob) {
	sjq.queue <- job
}

func worker(id int, sjq *ScraperJobQueue, wg *sync.WaitGroup) {
	defer wg.Done()
	c := colly.NewCollector()

	for job := range sjq.queue {
		err := c.Visit(job.URL)

		if err != nil {
			fmt.Printf("Worker %d failed to scrape %s: %v\n", id, job.URL, err)
		} else {
			fmt.Printf("Worker %d successfully scraped %s\n", id, job.URL)
		}
	}
}
