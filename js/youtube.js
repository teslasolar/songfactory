/**
 * YouTube Data API v3 monitor module.
 * Polls a channel for new uploads and manages video state.
 */
const YouTubeMonitor = (() => {
  const STORAGE_KEY = 'songfactory_videos';
  const API_BASE = 'https://www.googleapis.com/youtube/v3';

  function getConfig() {
    return {
      apiKey: localStorage.getItem('songfactory_api_key') || '',
      channelId: localStorage.getItem('songfactory_channel_id') || '',
    };
  }

  function saveConfig(apiKey, channelId) {
    localStorage.setItem('songfactory_api_key', apiKey);
    localStorage.setItem('songfactory_channel_id', channelId);
  }

  function getStoredVideos() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveVideos(videos) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  }

  function getVideoStatus(videoId) {
    const videos = getStoredVideos();
    return videos[videoId]?.status || 'NEW';
  }

  function setVideoStatus(videoId, status) {
    const videos = getStoredVideos();
    if (videos[videoId]) {
      videos[videoId].status = status;
      saveVideos(videos);
    }
  }

  function setVideoType(videoId, type) {
    const videos = getStoredVideos();
    if (videos[videoId]) {
      videos[videoId].type = type;
      saveVideos(videos);
    }
  }

  function setVideoMetadata(videoId, metadata) {
    const videos = getStoredVideos();
    if (videos[videoId]) {
      videos[videoId].metadata = metadata;
      saveVideos(videos);
    }
  }

  function getVideoMetadata(videoId) {
    const videos = getStoredVideos();
    return videos[videoId]?.metadata || null;
  }

  // Auto-detect if a video is a song based on title/description keywords
  function detectVideoType(title, description) {
    const skipKeywords = [
      'vlog', 'tutorial', 'review', 'unboxing', 'reaction',
      'stream', 'live stream', 'q&a', 'behind the scenes', 'update',
      'announcement', 'podcast', 'interview', 'trailer',
    ];
    const combined = (title + ' ' + (description || '')).toLowerCase();
    for (const kw of skipKeywords) {
      if (combined.includes(kw)) return 'skip';
    }
    return 'song';
  }

  async function fetchVideos() {
    const { apiKey, channelId } = getConfig();
    if (!apiKey || !channelId) {
      throw new Error('YouTube API key and Channel ID are required.');
    }

    const params = new URLSearchParams({
      part: 'snippet',
      channelId,
      order: 'date',
      maxResults: '25',
      type: 'video',
      key: apiKey,
    });

    const resp = await fetch(`${API_BASE}/search?${params}`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `YouTube API error: ${resp.status}`);
    }

    const data = await resp.json();
    const stored = getStoredVideos();

    for (const item of data.items) {
      const videoId = item.id.videoId;
      const snippet = item.snippet;
      if (!stored[videoId]) {
        stored[videoId] = {
          videoId,
          title: snippet.title,
          description: snippet.description,
          thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
          publishedAt: snippet.publishedAt,
          channelTitle: snippet.channelTitle,
          status: 'NEW',
          type: detectVideoType(snippet.title, snippet.description),
          metadata: null,
        };
      } else {
        // Update title/description in case they changed
        stored[videoId].title = snippet.title;
        stored[videoId].description = snippet.description;
        stored[videoId].thumbnail = snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || stored[videoId].thumbnail;
      }
    }

    saveVideos(stored);
    return stored;
  }

  function getAllVideos() {
    return getStoredVideos();
  }

  function getVideosByStatus(status) {
    const videos = getStoredVideos();
    return Object.values(videos).filter(v => v.status === status);
  }

  return {
    getConfig,
    saveConfig,
    fetchVideos,
    getAllVideos,
    getVideosByStatus,
    getVideoStatus,
    setVideoStatus,
    setVideoType,
    setVideoMetadata,
    getVideoMetadata,
    detectVideoType,
  };
})();
