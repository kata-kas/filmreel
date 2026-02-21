# FilmReel

A comprehensive Discord bot for tracking Letterboxd film ratings, creating leaderboards, and fostering film discussion communities.

## Features

- **User Registration**: Link Discord accounts to Letterboxd profiles
- **Automatic Scraping**: Daily background sync of ratings and watch history
- **Leaderboards**: Multiple views including main, alternative, popularity, and more
- **Film Recommendations**: Get personalized recommendations based on server ratings
- **User Comparisons**: Compare ratings between users
- **XP & Levels**: Gamification with XP for ratings, rewatches, and list completions
- **List Management**: Register and track Letterboxd lists with deadlines
- **Seasons**: Track film watching over defined time periods
- **Favorites**: Track favorite directors, genres, countries, and studios

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript (strict mode)
- **Discord**: discord.js v14
- **Database**: PostgreSQL with Prisma ORM
- **Job Queue**: BullMQ (Redis-backed)
- **Cache**: ioredis
- **Scraping**: axios + cheerio
- **External API**: TMDB (The Movie Database)

## Project Structure

```
src/
  bot/              # Discord bot implementation
    commands/       # Slash command handlers
    embeds/         # Embed builders
    pagination.ts   # Redis-backed pagination system
    utils/          # Bot utilities (roleManager)
  worker/           # BullMQ workers
    jobs/           # Job processors
  scheduler/        # Daily cron jobs
  scraper/          # Letterboxd HTML parsing
  tmdb/             # TMDB API integration
  db/               # Database
    prisma/         # Prisma schema and client
    queries/        # Encapsulated query functions
  queue/            # BullMQ definitions and enqueue helpers
  config/           # Configuration
  constants/        # Constants (XP weights, rating scales)
  types/            # Shared TypeScript types
  utils/            # Formatting and time utilities
```

## Setup (Fly.io only)

Use Fly.io as the only deployment path.

- Deployment topology + sizing + cost prediction: `FLY_IO_DEPLOYMENT_COST.md`
- Starter config for Fly process groups: `fly.toml`

### Quick Start

```bash
# 1) Install flyctl and auth
fly auth login

# 2) Edit fly config
# set app name + primary region in fly.toml

# 3) Set required secrets
fly secrets set \
  DISCORD_TOKEN=... \
  DISCORD_CLIENT_ID=... \
  DATABASE_URL=... \
  TMDB_API_KEY=... \
  GUILD_IDS=... \
  UPSTASH_REDIS_REST_URL=... \
  REDIS_DB_INDEX=1

# 4) Deploy (includes prisma migrate deploy via release_command)
fly deploy

# 5) Register Discord slash commands from local/CI
pnpm commands:register
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Discord bot token | - |
| `DISCORD_CLIENT_ID` | Discord application ID | - |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL (`rediss://...`) | - |
| `REDIS_DB_INDEX` | Redis DB index (non-default) | 1 |
| `TMDB_API_KEY` | The Movie Database API key | - |
| `GUILD_IDS` | Comma-separated guild IDs | - |
| `NODE_ENV` | Environment | production |
| `SCRAPE_CONCURRENCY` | Concurrent scrape jobs | 3 |
| `TMDB_CACHE_TTL_DAYS` | TMDB cache duration | 14 |
| `SCRAPE_COOLDOWN_MINUTES` | Minimum time between manual scrapes | 60 |
| `ADMIN_WEBHOOK_URL` | Discord webhook for admin alerts | - |

## Commands

### Registration & Account
- `/register [letterboxd_url]` - Register with Letterboxd
- `/setlb [username]` - Update Letterboxd username
- `/setnick [nickname]` - Set leaderboard nickname
- `/getlb [@user?]` - Get Letterboxd link
- `/getnick [@user?]` - Get nickname

### Scraping
- `/scrape [@user?]` - Trigger manual scrape
- `/scrapeunrated [@user?]` - Full scrape including unrated
- `/isbusy` - Check queue status

### Leaderboards
- `/lb [listname?] [@user?]` - Main leaderboard (10+ ratings)
- `/alt [listname?] [@user?]` - Alternative leaderboard (3-9 ratings)
- `/all [listname?] [@user?]` - Union of lb and alt
- `/pop [listname?] [@user?]` - Most popular films
- `/rec [listname?]` - Personalized recommendations
- `/rated` - Most films rated
- `/seen [listname?]` - Most films seen
- `/onthebubble` - Films with 9 ratings

### Film Queries
- `/rating [film] [@user?]` - Film rating info
- `/ratings [film]` - All ratings for a film
- `/ratings [@user] [listname]` - User's ratings on a list

### Social & Comparison
- `/compare [@user1] [@user2?]` - Compare two users
- `/friends [@user?]` - Users with most films in common
- `/sheep [min_ratings?]` - Users closest to server average
- `/divisive` - Most divisive films

### Profile & Favorites
- `/profile [@user?]` - View profile
- `/addfav [lookup]` - Add favorite
- `/delfav [lookup]` - Remove favorite
- `/xp` - XP leaderboard
- `/level [@user?]` - Check level

### Lists
- `/lists` - Show registered lists
- `/addlist [url]` - Register a list (mod only)
- `/deadline` - Show nearest deadline

## Testing

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui
```

## License

MIT
