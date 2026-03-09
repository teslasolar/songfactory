const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Extract audio and artwork from a YouTube video using yt-dlp.
 * Creates a release bundle directory with WAV + artwork + metadata.json.
 */
async function extractAudio(videoId, title, bundlesDir) {
  // Sanitize title for filesystem
  const safeTitle = title.replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_').substring(0, 80);
  const bundleDir = path.join(bundlesDir, safeTitle);

  if (!fs.existsSync(bundleDir)) {
    fs.mkdirSync(bundleDir, { recursive: true });
  }

  const url = `https://youtube.com/watch?v=${videoId}`;
  const audioPath = path.join(bundleDir, `${safeTitle}.wav`);
  const thumbBase = path.join(bundleDir, safeTitle);
  const artworkPath = path.join(bundleDir, `${safeTitle}_artwork.jpg`);

  // Step 1: Download audio as WAV
  await runCommand('yt-dlp', [
    '-x', '--audio-format', 'wav', '--audio-quality', '0',
    '-o', audioPath,
    url,
  ]);

  // Step 2: Download thumbnail
  await runCommand('yt-dlp', [
    '--write-thumbnail', '--skip-download',
    '-o', thumbBase,
    url,
  ]);

  // Step 3: Find the downloaded thumbnail and convert to 3000x3000 JPG
  const thumbFiles = fs.readdirSync(bundleDir).filter(f =>
    /\.(webp|jpg|jpeg|png)$/i.test(f) && !f.includes('_artwork')
  );

  if (thumbFiles.length > 0) {
    const thumbFile = path.join(bundleDir, thumbFiles[0]);
    try {
      await runCommand('convert', [
        thumbFile, '-resize', '3000x3000!',
        '-quality', '95',
        '-colorspace', 'sRGB',
        artworkPath,
      ]);
    } catch {
      // If ImageMagick not available, try ffmpeg
      await runCommand('ffmpeg', [
        '-i', thumbFile,
        '-vf', 'scale=3000:3000',
        '-q:v', '2',
        artworkPath,
      ]);
    }
  }

  // Verify output files
  const hasAudio = fs.existsSync(audioPath);
  const hasArtwork = fs.existsSync(artworkPath);

  return {
    bundleDir,
    audioPath: hasAudio ? audioPath : null,
    artworkPath: hasArtwork ? artworkPath : null,
    safeTitle,
  };
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = execFile(cmd, args, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${err.message}\n${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

module.exports = { extractAudio };
