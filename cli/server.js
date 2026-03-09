#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const { extractAudio } = require('./extract');
const { enqueueUpload, getQueueStatus } = require('./queue');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = parseInt(process.env.SONG_FACTORY_PORT || '3456', 10);
const BUNDLES_DIR = path.join(process.cwd(), 'release_bundles');

// Ensure bundles directory exists
if (!fs.existsSync(BUNDLES_DIR)) {
  fs.mkdirSync(BUNDLES_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());

// Health / status endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    bundlesDir: BUNDLES_DIR,
    queue: getQueueStatus(),
    uptime: process.uptime(),
  });
});

// Extract audio from YouTube video
app.post('/extract', async (req, res) => {
  const { videoId, title } = req.body;
  if (!videoId) {
    return res.status(400).json({ error: 'videoId is required' });
  }

  try {
    const result = await extractAudio(videoId, title || videoId, BUNDLES_DIR);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Extract error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Upload to DistroKid (queued)
app.post('/upload', async (req, res) => {
  const metadata = req.body;
  if (!metadata.song_title) {
    return res.status(400).json({ error: 'song_title is required in metadata' });
  }

  try {
    const jobId = enqueueUpload(metadata, BUNDLES_DIR);
    res.json({ success: true, jobId, message: 'Upload queued' });
  } catch (err) {
    console.error('Upload queue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get queue status
app.get('/queue', (req, res) => {
  res.json(getQueueStatus());
});

// List completed releases
app.get('/releases', (req, res) => {
  try {
    const bundles = fs.readdirSync(BUNDLES_DIR).filter(f =>
      fs.statSync(path.join(BUNDLES_DIR, f)).isDirectory()
    );
    const releases = bundles.map(dir => {
      const metaPath = path.join(BUNDLES_DIR, dir, 'metadata.json');
      let metadata = null;
      if (fs.existsSync(metaPath)) {
        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      }
      return { directory: dir, metadata };
    });
    res.json({ releases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nSong Factory CLI server running on http://localhost:${PORT}`);
  console.log(`Release bundles: ${BUNDLES_DIR}`);
  console.log('\nEndpoints:');
  console.log('  GET  /status    — server status');
  console.log('  POST /extract   — extract audio from YouTube');
  console.log('  POST /upload    — queue DistroKid upload');
  console.log('  GET  /queue     — upload queue status');
  console.log('  GET  /releases  — list release bundles\n');
});
