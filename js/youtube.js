/**
 * YouTube Data API v3 monitor module.
 *
 * Works in two modes:
 * 1. API Key (from CONFIG) — no login needed, reads public channel data
 * 2. OAuth token — user signed in, auto-detects their channel
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
   * Build request — uses OAuth token if available, otherwise API key from CONFIG.
   */
  function _buildRequest(params) {
    const headers = {};
    const googleToken = Auth.getGoogleToken();

    if (googleToken) {
      headers['Authorization'] = `Bearer ${googleToken}`;
    } else {
      const apiKey = Auth.getYouTubeApiKey();
      if (apiKey) {
        params.set('key', apiKey);
      }
    }

    return { headers };
  }

  async function detectChannel() {
    if (Auth.isGoogleConnected()) {
      const channel = await Auth.fetchYouTubeChannelId();
      if (channel) {
        saveChannel(channel);
        return channel;
      }
    }
    return null;
  }

  /**
   * Determine the channel ID to use.
   * Priority: stored channel > CONFIG > OAuth auto-detect
   */
  async function _resolveChannelId() {
    // 1. Already stored (from previous OAuth or manual)
    const stored = getStoredChannel().channelId;
    if (stored) return stored;

    // 2. Injected via CONFIG
    const fromConfig = Auth.getYouTubeChannelId();
    if (fromConfig) return fromConfig;

    // 3. Auto-detect via OAuth
    if (Auth.isGoogleConnected()) {
      const ch = await detectChannel();
      if (ch) return ch.channelId;
    }

    return null;
  }

  async function fetchVideos() {
    const channelId = await _resolveChannelId();

    if (!channelId) {
      throw new Error('No channel ID available. Add YOUTUBE_CHANNEL_ID to GitHub secrets or sign in with Google.');
    }

    if (!Auth.hasYouTubeAccess()) {
      throw new Error('No YouTube access. Add YOUTUBE_API_KEY to GitHub secrets or sign in with Google.');
    }

    const params = new URLSearchParams({
      part: 'snippet',
      channelId,
      order: 'date',
      maxResults: '25',
      type: 'video',
    });

    const { headers } = _buildRequest(params);

    const resp = await fetch(`${API_BASE}/search?${params}`, { headers });

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

  return {
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
