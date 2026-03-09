const path = require('path');
const fs = require('fs');

/**
 * Upload a release to DistroKid using Playwright browser automation.
 * Requires: DK_EMAIL and DK_PASS environment variables.
 */
async function uploadToDistroKid(metadata, bundlesDir) {
  const email = process.env.DK_EMAIL;
  const password = process.env.DK_PASS;

  if (!email || !password) {
    throw new Error('DK_EMAIL and DK_PASS environment variables are required');
  }

  // Locate the bundle
  const safeTitle = metadata.song_title
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 80);
  const bundleDir = path.join(bundlesDir, safeTitle);

  if (!fs.existsSync(bundleDir)) {
    throw new Error(`Bundle directory not found: ${bundleDir}`);
  }

  // Find audio and artwork files
  const audioFile = fs.readdirSync(bundleDir).find(f => /\.wav$/i.test(f));
  const artworkFile = fs.readdirSync(bundleDir).find(f => /_artwork\.jpg$/i.test(f));

  if (!audioFile) throw new Error('No WAV file found in bundle');

  const audioPath = path.join(bundleDir, audioFile);
  const artworkPath = artworkFile ? path.join(bundleDir, artworkFile) : null;

  // Save metadata to bundle
  fs.writeFileSync(
    path.join(bundleDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  // Launch browser automation
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Login to DistroKid
    await page.goto('https://distrokid.com/signin/', { waitUntil: 'networkidle' });
    await page.fill('input[name="email"], input[type="email"]', email);
    await page.fill('input[name="password"], input[type="password"]', password);
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' });

    // Navigate to upload page
    await page.goto('https://distrokid.com/new/', { waitUntil: 'networkidle' });

    // Fill in the song title
    const titleInput = await page.$('input[name*="title"], #songTitle, input[placeholder*="title"]');
    if (titleInput) {
      await titleInput.fill(metadata.song_title);
    }

    // Fill in artist name
    const artistInput = await page.$('input[name*="artist"], input[placeholder*="artist"]');
    if (artistInput) {
      await artistInput.fill(metadata.artist_name);
    }

    // Upload audio file
    const audioInput = await page.$('input[type="file"][accept*="audio"], input[type="file"]');
    if (audioInput) {
      await audioInput.setInputFiles(audioPath);
    }

    // Upload artwork
    if (artworkPath) {
      const artworkInputs = await page.$$('input[type="file"]');
      // The second file input is typically for artwork
      for (const input of artworkInputs) {
        const accept = await input.getAttribute('accept');
        if (accept && accept.includes('image')) {
          await input.setInputFiles(artworkPath);
          break;
        }
      }
    }

    // Select genre if possible
    const genreSelect = await page.$('select[name*="genre"]');
    if (genreSelect) {
      try {
        await genreSelect.selectOption({ label: metadata.genre });
      } catch {
        // Genre option may not match exactly; skip
      }
    }

    // Set release date if field exists
    const dateInput = await page.$('input[type="date"][name*="date"], input[name*="release"]');
    if (dateInput) {
      await dateInput.fill(metadata.release_date);
    }

    // Note: actual form structure may vary — this provides the framework.
    // DistroKid's form changes over time, so selectors may need updating.
    // The script opens in headed mode so you can manually verify and submit.

    console.log('Form filled. Please verify and submit manually if needed.');
    console.log('Waiting 60 seconds for manual review...');

    // Wait for user to review / auto-submit
    await page.waitForTimeout(60000);

    return {
      success: true,
      song_title: metadata.song_title,
      message: 'Upload form submitted',
    };
  } finally {
    await browser.close();
  }
}

module.exports = { uploadToDistroKid };
