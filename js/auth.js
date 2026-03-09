/**
 * Auth module — OAuth flows for YouTube (Google), Spotify, and DistroKid.
 *
 * Since we're running in the browser (GitHub Pages), we use:
 * - Google: OAuth 2.0 implicit flow via Google Identity Services
 * - Spotify: OAuth 2.0 PKCE flow (no server/secret needed)
 * - DistroKid: Session detection via local CLI server (no public API/OAuth)
 *
 * All tokens are stored in localStorage with expiry tracking.
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
    dkConnected: 'sf_dk_connected',
    googleClientId: 'sf_google_client_id',
    spotifyClientId: 'sf_spotify_client_id',
  };

  // --- Google / YouTube OAuth ---

  function getGoogleClientId() {
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

  /**
   * Initiate Google OAuth via popup.
   * Uses the OAuth 2.0 implicit grant flow with a popup window.
   */
  function connectGoogle() {
    return new Promise((resolve, reject) => {
      const clientId = getGoogleClientId();
      if (!clientId) {
        reject(new Error('Set your Google Client ID first.'));
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

      // Poll the popup for the redirect with token in hash
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
          // Cross-origin — popup is still on Google's domain, keep polling
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
      throw new Error('OAuth state mismatch — possible CSRF.');
    }

    if (!accessToken) {
      throw new Error('No access token received.');
    }

    localStorage.setItem(STORAGE.googleToken, accessToken);
    localStorage.setItem(STORAGE.googleExpiry, String(Date.now() + expiresIn * 1000));

    // Fetch user info async (fire and forget)
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

  /**
   * Also fetch the user's YouTube channel ID automatically.
   */
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

  // --- Spotify OAuth (PKCE) ---

  function getSpotifyClientId() {
    return localStorage.getItem(STORAGE.spotifyClientId) || '';
  }

  function setSpotifyClientId(id) {
    localStorage.setItem(STORAGE.spotifyClientId, id);
  }

  function getSpotifyToken() {
    const token = localStorage.getItem(STORAGE.spotifyToken);
    const expiry = parseInt(localStorage.getItem(STORAGE.spotifyExpiry) || '0', 10);
    if (!token || Date.now() > expiry) return null;
    return token;
  }

  function isSpotifyConnected() {
    return !!getSpotifyToken();
  }

  function getSpotifyUser() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.spotifyUser)) || null;
    } catch {
      return null;
    }
  }

  /**
   * Spotify OAuth 2.0 with PKCE — no client secret required.
   */
  async function connectSpotify() {
    const clientId = getSpotifyClientId();
    if (!clientId) {
      throw new Error('Set your Spotify Client ID first.');
    }

    const redirectUri = _getRedirectUri();
    const codeVerifier = _randomString(64);
    const codeChallenge = await _sha256Base64url(codeVerifier);

    localStorage.setItem(STORAGE.spotifyCodeVerifier, codeVerifier);

    const state = _randomString(32);
    sessionStorage.setItem('sf_spotify_state', state);

    const scope = [
      'user-read-private',
      'user-read-email',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });

    // For Spotify PKCE we redirect the whole page (not popup) because
    // Spotify's consent screen works better as a redirect.
    // We'll handle the callback on page load.
    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  }

  /**
   * Handle Spotify callback — called on page load if URL has ?code= param.
   */
  async function handleSpotifyCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (!code) return false;

    // Clean URL
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

    // Fetch user profile
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

  // --- DistroKid (session-based via local CLI) ---

  function isDistroKidConnected() {
    return localStorage.getItem(STORAGE.dkConnected) === 'true';
  }

  function setDistroKidConnected(connected) {
    localStorage.setItem(STORAGE.dkConnected, String(connected));
  }

  /**
   * Open DistroKid login in a new tab.
   * User logs in manually, then clicks "I'm logged in" in dashboard.
   * The local CLI server will use Chrome's user profile cookies for automation.
   */
  function openDistroKidLogin() {
    window.open('https://distrokid.com/signin/', '_blank', 'noopener');
  }

  // --- Spotify API helpers ---

  /**
   * Search Spotify for artist's tracks to check release status.
   */
  async function searchSpotifyArtist(artistName) {
    const token = getSpotifyToken();
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

  /**
   * Get an artist's albums/singles from Spotify.
   */
  async function getSpotifyArtistReleases(artistId) {
    const token = getSpotifyToken();
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

  /**
   * Search Spotify for a specific track to check if it's live.
   */
  async function searchSpotifyTrack(trackName, artistName) {
    const token = getSpotifyToken();
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

  // --- Utilities ---

  function _getRedirectUri() {
    // Use the current page URL (without hash/query) as redirect URI
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
    // Google
    getGoogleClientId,
    setGoogleClientId,
    getGoogleToken,
    isGoogleConnected,
    getGoogleUser,
    connectGoogle,
    disconnectGoogle,
    fetchYouTubeChannelId,

    // Spotify
    getSpotifyClientId,
    setSpotifyClientId,
    getSpotifyToken,
    isSpotifyConnected,
    getSpotifyUser,
    connectSpotify,
    handleSpotifyCallback,
    refreshSpotifyToken,
    disconnectSpotify,
    searchSpotifyArtist,
    getSpotifyArtistReleases,
    searchSpotifyTrack,

    // DistroKid
    isDistroKidConnected,
    setDistroKidConnected,
    openDistroKidLogin,
  };
})();
