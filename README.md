# Song Factory Pipeline

YouTube to DistroKid to Spotify automation dashboard.

## What it does

1. Monitors your YouTube channel for new uploads
2. Extracts audio (WAV) and artwork from YouTube videos
3. Auto-fills DistroKid metadata from YouTube title/description
4. Automates DistroKid upload via browser automation
5. Tracks release status: NEW > PREPARING > READY > UPLOADING > LIVE

## Architecture

- **Dashboard** (`index.html`) — GitHub Pages frontend. Shows videos, edit metadata, trigger actions.
- **CLI Server** (`cli/`) — Local Node.js server that handles audio extraction (yt-dlp) and DistroKid upload (Playwright).
- **Shell script** (`extract.sh`) — Standalone extraction script for manual use.

## Quick Start

### Dashboard

Deploy to GitHub Pages or open `index.html` locally. Configure your YouTube API key and Channel ID in the settings.

### Local CLI Server

```bash
cd cli
npm install
node server.js
```

Server runs on `http://localhost:3456`. The dashboard communicates with it for extract/upload operations.

### Requirements

- **Node.js** >= 18
- **yt-dlp** — `pip install yt-dlp`
- **ImageMagick** or **ffmpeg** — for artwork conversion
- **Playwright** — `npx playwright install chromium` (for DistroKid upload)

### DistroKid Upload

Set environment variables before starting the CLI server:

```bash
export DK_EMAIL="your@email.com"
export DK_PASS="your_password"
node server.js
```

### Standalone Extraction

```bash
chmod +x extract.sh
./extract.sh VIDEO_ID "Song Title"
```

## Project Structure

```
index.html              Dashboard (GitHub Pages)
css/style.css           Dashboard styles
js/youtube.js           YouTube Data API v3 monitor
js/metadata.js          Auto-fill metadata parser
js/bridge.js            Localhost bridge (dashboard <-> CLI)
js/dashboard.js         UI controller
cli/server.js           Express server (local)
cli/extract.js          yt-dlp audio extraction
cli/upload.js           Playwright DistroKid automation
cli/queue.js            Sequential upload queue
extract.sh              Standalone extraction script
```
