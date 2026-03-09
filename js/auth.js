/**
 * Auth module — handles all service authentication.
 *
 * Three tiers of access:
 * 1. NO-AUTH (build-injected secrets via CONFIG):
 *    - YouTube: API key → public channel data, video listings
 *    - Spotify: Client Credentials → public search, artist/album data
 *
 * 2. OAUTH (user clicks "Sign in"):
 *    - Google: OAuth 2.0 implicit → private videos, user's own channel auto-detect
 *    - Spotify: PKCE flow → user profile, personalized data
 *
 * 3. SESSION (manual):
 *    - DistroKid: user logs in via popup, local CLI uses browser cookies
 */
const Auth = (() => {
  const STORAGE = {
    googleToken: 'sf_google_token',
    googleExpiry: 'sf_google_expiry',
    googleUser: 'sf_google_user',
    spotifyToken: 'sf_spotify_token',
    spotifyExpiry: 'sf_spotify_expiry',
    spotifyUser: 'sf_spotify_user',
    spotifyRefresh: 'sf_spotify_refresh',
    spotifyCodeVerifier: 'sf_spotify_code_verifier',
    spotifyAppToken: 'sf_spotify_app_token',
    spotifyAppExpiry: 'sf_spotify_app_expiry',
    dkConnected: 'sf_dk_connected',
    googleClientId: 'sf_google_client_id',
    spotifyClientId: 'sf_spotify_client_id',
  };

  // ============================================================
  //  YOUTUBE / GOOGLE
  // ============================================================

  /**
   * Get YouTube API key — from CONFIG (build-injected) or localStorage.
   */
  function getYouTubeApiKey() {
    if (CONFIG.hasYouTube) return CONFIG.YOUTUBE_API_KEY;
    return localStorage.getItem('songfactory_api_key') || '';
  }

  function getYouTubeChannelId() {
    if (CONFIG.hasYouTubeChannel) return CONFIG.YOUTUBE_CHANNEL_ID;
    return localStorage.getItem('songfactory_channel_id') || '';
  }

  function hasYouTubeAccess() {
    return !!getYouTubeApiKey() || isGoogleConnected();
  }

  // --- Google OAuth (optional upgrade) ---

  function getGoogleClientId() {
    if (CONFIG.hasGoogleOAuth) return CONFIG.GOOGLE_CLIENT_ID;
    return localStorage.getItem(STORAGE.googleClientId) || '';
  }

  function setGoogleClientId(id) {
    localStorage.setItem(STORAGE.googleClientId, id);
  }

  function getGoogleToken() {
    const token = localStorage.getItem(STORAGE.googleToken);
    const expiry = parseInt(localStorage.getItem(STORAGE.googleExpiry) || '0', 10);
    if (!token || Date.now() > expiry) return null;
    return token;
  }

  function isGoogleConnected() {
    return !!getGoogleToken();
  }

  function getGoogleUser() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.googleUser)) || null;
    } catch {
      return null;
    }
  }

  function connectGoogle() {
    return new Promise((resolve, reject) => {
      const clientId = getGoogleClientId();
      if (!clientId) {
        reject(new Error('Google Client ID not configured.'));
        return;
      }

      const redirectUri = _getRedirectUri();
      const scope = [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/userinfo.profile',
      ].join(' ');

      const state = _randomString(32);
      sessionStorage.setItem('sf_oauth_state', state);

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'token',
        scope,
        state,
        prompt: 'consent',
        include_granted_scopes: 'true',
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      const popup = window.open(authUrl, 'google_auth', 'width=500,height=700,popup=yes');

      if (!popup) {
        reject(new Error('Popup blocked. Allow popups for this site.'));
        return;
      }

      const pollTimer = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(pollTimer);
            if (isGoogleConnected()) {
              resolve(getGoogleUser());
            } else {
              reject(new Error('Auth cancelled.'));
            }
            return;
          }
          const popupUrl = popup.location.href;
          if (popupUrl.startsWith(redirectUri)) {
            clearInterval(pollTimer);
            const hash = popup.location.hash.substring(1);
            popup.close();
            _handleGoogleCallback(hash, state);
            resolve(getGoogleUser());
          }
        } catch {
          // Cross-origin — still on Google's domain
        }
      }, 200);
    });
  }

  function _handleGoogleCallback(hash, expectedState) {
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
    const returnedState = params.get('state');

    if (returnedState !== expectedState) {
      throw new Error('OAuth state mismatch.');
    }
    if (!accessToken) {
      throw new Error('No access token received.');
    }

    localStorage.setItem(STORAGE.googleToken, accessToken);
    localStorage.setItem(STORAGE.googleExpiry, String(Date.now() + expiresIn * 1000));
    _fetchGoogleUserInfo(accessToken);
  }

  async function _fetchGoogleUserInfo(token) {
    try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const user = await resp.json();
        localStorage.setItem(STORAGE.googleUser, JSON.stringify({
          name: user.name,
          picture: user.picture,
          id: user.id,
        }));
      }
    } catch {
      // Non-critical
    }
  }

  async function fetchYouTubeChannelId() {
    const token = getGoogleToken();
    if (!token) return null;

    const resp = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.items && data.items.length > 0) {
      return {
        channelId: data.items[0].id,
        channelTitle: data.items[0].snippet.title,
        channelThumb: data.items[0].snippet.thumbnails?.default?.url,
      };
    }
    return null;
  }

  function disconnectGoogle() {
    localStorage.removeItem(STORAGE.googleToken);
    localStorage.removeItem(STORAGE.googleExpiry);
    localStorage.removeItem(STORAGE.googleUser);
  }

  // ============================================================
  //  SPOTIFY
  // ============================================================

  /**
   * Spotify Client Credentials flow — NO user login needed.
   * Uses client_id + client_secret from CONFIG to get an app-level token.
   * Good for: search, artist data, album listings (all public data).
   */
  async function ensureSpotifyAppToken() {
    // Check if we already have a valid app token
    const existing = localStorage.getItem(STORAGE.spotifyAppToken);
    const expiry = parseInt(localStorage.getItem(STORAGE.spotifyAppExpiry) || '0', 10);
    if (existing && Date.now() < expiry) return existing;

    if (!CONFIG.hasSpotify) return null;

    const credentials = btoa(`${CONFIG.SPOTIFY_CLIENT_ID}:${CONFIG.SPOTIFY_CLIENT_SECRET}`);
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    localStorage.setItem(STORAGE.spotifyAppToken, data.access_token);
    localStorage.setItem(STORAGE.spotifyAppExpiry, String(Date.now() + data.expires_in * 1000));
    return data.access_token;
  }

  /**
   * Get the best available Spotify token:
   * 1. User OAuth token (if logged in)
   * 2. App-level Client Credentials token (if secrets configured)
   */
  async function getSpotifyToken() {
    // Prefer user token
    const userToken = _getSpotifyUserToken();
    if (userToken) return userToken;

    // Fall back to app token
    return await ensureSpotifyAppToken();
  }

  function _getSpotifyUserToken() {
    const token = localStorage.getItem(STORAGE.spotifyToken);
    const expiry = parseInt(localStorage.getItem(STORAGE.spotifyExpiry) || '0', 10);
    if (!token || Date.now() > expiry) return null;
    return token;
  }

  function isSpotifyConnected() {
    return !!_getSpotifyUserToken();
  }

  function hasSpotifyAccess() {
    return CONFIG.hasSpotify || isSpotifyConnected();
  }

  function getSpotifyClientId() {
    if (CONFIG.hasSpotifyClientOnly) return CONFIG.SPOTIFY_CLIENT_ID;
    return localStorage.getItem(STORAGE.spotifyClientId) || '';
  }

  function setSpotifyClientId(id) {
    localStorage.setItem(STORAGE.spotifyClientId, id);
  }

  function getSpotifyUser() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.spotifyUser)) || null;
    } catch {
      return null;
    }
  }

  // --- Spotify OAuth PKCE (optional user login) ---

  async function connectSpotify() {
    const clientId = getSpotifyClientId();
    if (!clientId) {
      throw new Error('Spotify Client ID not configured.');
    }

    const redirectUri = _getRedirectUri();
    const codeVerifier = _randomString(64);
    const codeChallenge = await _sha256Base64url(codeVerifier);

    localStorage.setItem(STORAGE.spotifyCodeVerifier, codeVerifier);

    const state = _randomString(32);
    sessionStorage.setItem('sf_spotify_state', state);

    const scope = 'user-read-private user-read-email';

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  }

  async function handleSpotifyCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (!code) return false;

    window.history.replaceState({}, document.title, url.pathname);

    if (error) {
      console.error('Spotify auth error:', error);
      return false;
    }

    const expectedState = sessionStorage.getItem('sf_spotify_state');
    if (state !== expectedState) {
      console.error('Spotify state mismatch');
      return false;
    }

    const codeVerifier = localStorage.getItem(STORAGE.spotifyCodeVerifier);
    if (!codeVerifier) {
      console.error('Missing code verifier');
      return false;
    }

    const clientId = getSpotifyClientId();
    const redirectUri = _getRedirectUri();

    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
      }),
    });

    if (!resp.ok) {
      console.error('Spotify token exchange failed');
      return false;
    }

    const data = await resp.json();
    localStorage.setItem(STORAGE.spotifyToken, data.access_token);
    localStorage.setItem(STORAGE.spotifyExpiry, String(Date.now() + data.expires_in * 1000));
    if (data.refresh_token) {
      localStorage.setItem(STORAGE.spotifyRefresh, data.refresh_token);
    }
    localStorage.removeItem(STORAGE.spotifyCodeVerifier);

    await _fetchSpotifyUserInfo(data.access_token);
    return true;
  }

  async function refreshSpotifyToken() {
    const refreshToken = localStorage.getItem(STORAGE.spotifyRefresh);
    const clientId = getSpotifyClientId();
    if (!refreshToken || !clientId) return false;

    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }),
    });

    if (!resp.ok) return false;

    const data = await resp.json();
    localStorage.setItem(STORAGE.spotifyToken, data.access_token);
    localStorage.setItem(STORAGE.spotifyExpiry, String(Date.now() + data.expires_in * 1000));
    if (data.refresh_token) {
      localStorage.setItem(STORAGE.spotifyRefresh, data.refresh_token);
    }
    return true;
  }

  async function _fetchSpotifyUserInfo(token) {
    try {
      const resp = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const user = await resp.json();
        localStorage.setItem(STORAGE.spotifyUser, JSON.stringify({
          name: user.display_name,
          id: user.id,
          picture: user.images?.[0]?.url || '',
          product: user.product,
        }));
      }
    } catch {
      // Non-critical
    }
  }

  function disconnectSpotify() {
    localStorage.removeItem(STORAGE.spotifyToken);
    localStorage.removeItem(STORAGE.spotifyExpiry);
    localStorage.removeItem(STORAGE.spotifyUser);
    localStorage.removeItem(STORAGE.spotifyRefresh);
    localStorage.removeItem(STORAGE.spotifyCodeVerifier);
  }

  // --- Spotify API (works with either token type) ---

  async function searchSpotifyArtist(artistName) {
    const token = await getSpotifyToken();
    if (!token) return null;

    const params = new URLSearchParams({
      q: `artist:${artistName}`,
      type: 'artist',
      limit: '5',
    });

    const resp = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.artists?.items || [];
  }

  async function getSpotifyArtistReleases(artistId) {
    const token = await getSpotifyToken();
    if (!token) return null;

    const params = new URLSearchParams({
      include_groups: 'single,album',
      limit: '50',
      market: 'US',
    });

    const resp = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}/albums?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.items || [];
  }

  async function searchSpotifyTrack(trackName, artistName) {
    const token = await getSpotifyToken();
    if (!token) return null;

    const q = `track:${trackName} artist:${artistName}`;
    const params = new URLSearchParams({ q, type: 'track', limit: '5' });

    const resp = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.tracks?.items || [];
  }

  // ============================================================
  //  DISTROKID
  // ============================================================

  function isDistroKidConnected() {
    return localStorage.getItem(STORAGE.dkConnected) === 'true';
  }

  function setDistroKidConnected(connected) {
    localStorage.setItem(STORAGE.dkConnected, String(connected));
  }

  function openDistroKidLogin() {
    window.open('https://distrokid.com/signin/', '_blank', 'noopener');
  }

  // ============================================================
  //  UTILITIES
  // ============================================================

  function _getRedirectUri() {
    return window.location.origin + window.location.pathname;
  }

  function _randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => chars[b % chars.length]).join('');
  }

  async function _sha256Base64url(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  return {
    // YouTube
    getYouTubeApiKey,
    getYouTubeChannelId,
    hasYouTubeAccess,

    // Google OAuth
    getGoogleClientId,
    setGoogleClientId,
    getGoogleToken,
    isGoogleConnected,
    getGoogleUser,
    connectGoogle,
    disconnectGoogle,
    fetchYouTubeChannelId,

    // Spotify
    getSpotifyToken,
    getSpotifyClientId,
    setSpotifyClientId,
    isSpotifyConnected,
    hasSpotifyAccess,
    getSpotifyUser,
    connectSpotify,
    handleSpotifyCallback,
    refreshSpotifyToken,
    disconnectSpotify,
    ensureSpotifyAppToken,
    searchSpotifyArtist,
    getSpotifyArtistReleases,
    searchSpotifyTrack,

    // DistroKid
    isDistroKidConnected,
    setDistroKidConnected,
    openDistroKidLogin,
  };
})();
