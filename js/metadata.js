/**
 * Metadata auto-fill module.
 * Parses YouTube video info into DistroKid-ready metadata.
 */
const MetadataParser = (() => {
  const TEMPLATE_KEY = 'songfactory_template';

  const GENRE_KEYWORDS = {
    'industrial': 'Industrial',
    'techno': 'Techno',
    'electronic': 'Electronic',
    'ambient': 'Ambient',
    'folk': 'Indie Folk',
    'indie': 'Indie Folk',
    'punk': 'Punk',
    'metal': 'Metal',
    'noise': 'Noise',
    'hip hop': 'Hip-Hop/Rap',
    'hip-hop': 'Hip-Hop/Rap',
    'rap': 'Hip-Hop/Rap',
    'rock': 'Rock',
    'pop': 'Pop',
    'experimental': 'Experimental',
    'synthwave': 'Electronic',
    'synth': 'Electronic',
    'drone': 'Ambient',
    'lofi': 'Electronic',
    'lo-fi': 'Electronic',
    'dark': 'Industrial',
    'beat': 'Electronic',
    'trap': 'Hip-Hop/Rap',
  };

  const EXPLICIT_MARKERS = [
    'explicit', 'nsfw', 'fuck', 'shit', 'damn', 'ass',
    'bitch', 'dick', 'hell', 'sex', 'drug', 'kill',
  ];

  function cleanTitle(rawTitle) {
    let title = rawTitle;
    // Remove common YouTube title patterns
    title = title.replace(/\s*[\|\-\u2013\u2014]\s*(official\s*)?(music\s*)?(video|audio|lyric|visualizer).*/i, '');
    title = title.replace(/\s*\(official\s*(music\s*)?(video|audio|lyric|visualizer)\)/i, '');
    title = title.replace(/\s*\[official\s*(music\s*)?(video|audio|lyric|visualizer)\]/i, '');
    // Remove leading/trailing emoji-like characters
    title = title.replace(/^[\s\u{1F3B5}\u{1F3B6}\u{1F3A4}\u{1F525}\u{2728}\u{1F680}]+/u, '');
    title = title.replace(/[\s\u{1F3B5}\u{1F3B6}\u{1F3A4}\u{1F525}\u{2728}\u{1F680}]+$/u, '');
    // Remove channel name prefixes like "ArtistName - "
    // Only if there's a clear separator
    const separatorMatch = title.match(/^.{3,30}\s*[-\u2013\u2014]\s+(.+)$/);
    if (separatorMatch) {
      title = separatorMatch[1];
    }
    return title.trim();
  }

  function detectGenre(title, description) {
    const text = (title + ' ' + (description || '')).toLowerCase();
    for (const [keyword, genre] of Object.entries(GENRE_KEYWORDS)) {
      if (text.includes(keyword)) {
        return genre;
      }
    }
    return 'Electronic'; // default
  }

  function detectExplicit(title, description) {
    const text = (title + ' ' + (description || '')).toLowerCase();
    return EXPLICIT_MARKERS.some(marker => text.includes(marker));
  }

  function detectLanguage(title, description) {
    const text = (title + ' ' + (description || '')).toLowerCase();
    const germanWords = ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'nicht', 'auf', 'mit', 'deutsch', 'german'];
    let germanCount = 0;
    for (const word of germanWords) {
      if (text.includes(word)) germanCount++;
    }
    if (germanCount >= 2) return 'German';
    return 'English';
  }

  function getReleaseDateDefault() {
    const d = new Date();
    d.setDate(d.getDate() + 7); // 7 days from now for Spotify editorial consideration
    return d.toISOString().split('T')[0];
  }

  function generateMetadata(video) {
    const songTitle = cleanTitle(video.title);
    const genre = detectGenre(video.title, video.description);
    const explicit = detectExplicit(video.title, video.description);
    const language = detectLanguage(video.title, video.description);
    const template = getTemplate();

    return {
      artist_name: template.artist_name || 'ThomasTheSolarCryptoEngine',
      song_title: songTitle,
      album_title: songTitle + ' (Single)',
      genre,
      release_date: getReleaseDateDefault(),
      language,
      explicit,
      performer_credits: template.performer_credits || 'ThomasTheSolarCryptoEngine - AI Music Production',
      producer_credits: template.producer_credits || 'ThomasTheSolarCryptoEngine - Self-Produced',
      copyright_year: new Date().getFullYear(),
      copyright_holder: template.copyright_holder || 'Thomas Frumkin',
      stores: template.stores || ['spotify', 'apple', 'amazon', 'tiktok', 'youtube_music'],
      isrc: 'auto',
      upc: 'auto',
      youtube_video_id: video.videoId,
      youtube_title: video.title,
    };
  }

  function getTemplate() {
    try {
      return JSON.parse(localStorage.getItem(TEMPLATE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveTemplate(template) {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(template));
  }

  return {
    cleanTitle,
    detectGenre,
    detectExplicit,
    detectLanguage,
    generateMetadata,
    getTemplate,
    saveTemplate,
    getReleaseDateDefault,
  };
})();
