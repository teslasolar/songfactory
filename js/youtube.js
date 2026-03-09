/**
 * YouTube Data API v3 monitor module.
 * Uses OAuth token from Auth module (no API key needed).
 * Falls back to API key if OAuth not connected.
 */
const YouTubeMonitor = (() => {
  const STORAGE_KEY = 'songfactory_videos';
  const CHANNEL_KEY = 'songfactory_channel';
  const API_BASE = 'https://www.googleapis.com/youtube/v3';

  function getStoredChannel() {
    try {
      return JSON.parse(localStorage.getItem(CHANNEL_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveChannel(channel) {
    localStorage.setItem(CHANNEL_KEY, JSON.stringify(channel));
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

  /**
   * Build request headers — use OAuth token if available.
   */
  function _getHeaders() {
    const token = Auth.getGoogleToken();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }

  /**
   * Build query params — only add API key if no OAuth token.
   */
  function _addAuth(params) {
    if (!Auth.isGoogleConnected()) {
      // Fallback: check for legacy API key
      const legacyKey = localStorage.getItem('songfactory_api_key');
      if (legacyKey) {
        params.set('key', legacyKey);
      }
    }
    return params;
  }

  /**
   * Auto-detect channel from OAuth login.
   */
  async function detectChannel() {
    if (!Auth.isGoogleConnected()) return null;

    const channel = await Auth.fetchYouTubeChannelId();
    if (channel) {
      saveChannel(channel);
    }
    return channel;
  }

  /**
   * Fetch videos from the user's channel.
   * Uses OAuth — gets the channel automatically from the signed-in account.
   */
  async function fetchVideos() {
    let channelId = getStoredChannel().channelId;

    // If we have OAuth but no channel yet, auto-detect
    if (!channelId && Auth.isGoogleConnected()) {
      const ch = await detectChannel();
      if (ch) channelId = ch.channelId;
    }

    // Legacy fallback
    if (!channelId) {
      channelId = localStorage.getItem('songfactory_channel_id');
    }

    if (!channelId && !Auth.isGoogleConnected()) {
      throw new Error('Sign in with Google to auto-detect your channel, or set a Channel ID.');
    }

    const params = new URLSearchParams({
      part: 'snippet',
      order: 'date',
      maxResults: '25',
      type: 'video',
    });

    if (channelId) {
      params.set('channelId', channelId);
    }

    _addAuth(params);

    const resp = await fetch(`${API_BASE}/search?${params}`, {
      headers: _getHeaders(),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 401 && Auth.isGoogleConnected()) {
        Auth.disconnectGoogle();
        throw new Error('Google session expired. Please sign in again.');
      }
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

  // Legacy compat
  function getConfig() {
    return {
      apiKey: localStorage.getItem('songfactory_api_key') || '',
      channelId: getStoredChannel().channelId || localStorage.getItem('songfactory_channel_id') || '',
    };
  }

  function saveConfig(apiKey, channelId) {
    if (apiKey) localStorage.setItem('songfactory_api_key', apiKey);
    if (channelId) localStorage.setItem('songfactory_channel_id', channelId);
  }

  return {
    getConfig,
    saveConfig,
    getStoredChannel,
    detectChannel,
    fetchVideos,
    getAllVideos,
    getVideosByStatus,
    setVideoStatus,
    setVideoType,
    setVideoMetadata,
    getVideoMetadata,
    detectVideoType,
  };
})();
