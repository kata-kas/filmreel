package main

import (
	"context"
	"crypto/md5"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/stealth"
	_ "github.com/joho/godotenv/autoload"
	"github.com/kata-kas/filmreel/commands"
	"github.com/kata-kas/filmreel/letterboxd"
	"github.com/kata-kas/filmreel/store"
	"github.com/kata-kas/filmreel/utils"
)

func main() {
	db := store.NewStore()

	path, noPathErr := launcher.LookPath()
	if noPathErr != false {
		log.Println("Error looking for browser path")
	}

	debugUrl := launcher.New().
		Bin(path).
		Devtools(false).
		Headless(true).
		NoSandbox(true).
		MustLaunch()

	browser := rod.New().ControlURL(debugUrl).Timeout(time.Hour).MustConnect().Context(context.Background())
	browser.SlowMotion(time.Second * 1)
	defer browser.MustClose()
	fmt.Printf("js: %x\n\n", md5.Sum([]byte(stealth.JS)))

	lb := letterboxd.NewLB(browser, db)

	// scraper.StartJobQueue()
	token := utils.EnvString("DISCORD_TOKEN", "")
	discordbot, err := discordgo.New("Bot " + token)
	if err != nil {
		log.Fatal(err)
	}
	defer discordbot.Close()
	discordbot.AddHandler(func(s *discordgo.Session, r *discordgo.Ready) {
		log.Printf("Logged in as: %v#%v", s.State.User.Username, s.State.User.Discriminator)
	})
	discordbot.Identify.Intents = discordgo.MakeIntent(discordgo.IntentsGuildMembers)

	err = discordbot.Open()
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("the bot is online")
	c := commands.NewCommands(discordbot, db, lb)
	c.RegisterCommands()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	log.Println("Press Ctrl+C to exit")
	<-stop

	log.Println("Gracefully shutting down.")
}
