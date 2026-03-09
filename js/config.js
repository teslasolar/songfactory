/**
 * Build-time configuration.
 *
 * Placeholders are replaced by GitHub Actions at deploy time using repo secrets.
 * If not replaced (local dev), falls back to localStorage values.
 *
 * GitHub repo secrets to set:
 *   YOUTUBE_API_KEY       — YouTube Data API v3 key (Google Cloud Console)
 *   YOUTUBE_CHANNEL_ID    — Your YouTube channel ID
 *   GOOGLE_CLIENT_ID      — Google OAuth client ID (for optional user login)
 *   SPOTIFY_CLIENT_ID     — Spotify app client ID
 *   SPOTIFY_CLIENT_SECRET — Spotify app client secret (for Client Credentials flow)
 */
const CONFIG = {
  // YouTube — API key alone gives full read access to public channel data
  YOUTUBE_API_KEY:       '%%YOUTUBE_API_KEY%%',
  YOUTUBE_CHANNEL_ID:    '%%YOUTUBE_CHANNEL_ID%%',

  // Google OAuth — optional, for "Sign in with Google" (private video access)
  GOOGLE_CLIENT_ID:      '%%GOOGLE_CLIENT_ID%%',

  // Spotify — Client Credentials flow works without user login
  // Gives access to public search, artist data, album listings
  SPOTIFY_CLIENT_ID:     '%%SPOTIFY_CLIENT_ID%%',
  SPOTIFY_CLIENT_SECRET: '%%SPOTIFY_CLIENT_SECRET%%',

  // Helpers
  _isSet(val) {
    return val && !val.startsWith('%%') && !val.endsWith('%%');
  },

  get hasYouTube() {
    return this._isSet(this.YOUTUBE_API_KEY);
  },

  get hasYouTubeChannel() {
    return this._isSet(this.YOUTUBE_CHANNEL_ID);
  },

  get hasGoogleOAuth() {
    return this._isSet(this.GOOGLE_CLIENT_ID);
  },

  get hasSpotify() {
    return this._isSet(this.SPOTIFY_CLIENT_ID) && this._isSet(this.SPOTIFY_CLIENT_SECRET);
  },

  get hasSpotifyClientOnly() {
    return this._isSet(this.SPOTIFY_CLIENT_ID);
  },
};
