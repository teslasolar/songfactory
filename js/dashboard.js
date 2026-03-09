/**
 * Dashboard UI controller.
 *
 * Auto-initializes based on available config:
 * - If YOUTUBE_API_KEY + CHANNEL_ID in CONFIG → auto-fetches videos on load
 * - If SPOTIFY secrets in CONFIG → Spotify section auto-appears, no login needed
 * - OAuth buttons only shown when client IDs are available
 * - Everything works without any user login when secrets are in GitHub
 */
(() => {
  let selectedVideoId = null;

  const els = {
    connectionStatus: document.getElementById('connection-status'),
    // Auth
    googleClientId: document.getElementById('google-client-id'),
    spotifyClientId: document.getElementById('spotify-client-id'),
    manualYtKey: document.getElementById('manual-yt-key'),
    manualChannelId: document.getElementById('manual-channel-id'),
    localPort: document.getElementById('local-port'),
    saveManualConfig: document.getElementById('save-manual-config'),
    googleStatus: document.getElementById('google-status'),
    spotifyStatus: document.getElementById('spotify-status'),
    dkStatus: document.getElementById('dk-status'),
    googleUserInfo: document.getElementById('google-user-info'),
    googleAvatar: document.getElementById('google-avatar'),
    googleUsername: document.getElementById('google-username'),
    googleChannel: document.getElementById('google-channel'),
    spotifyUserInfo: document.getElementById('spotify-user-info'),
    spotifyAvatar: document.getElementById('spotify-avatar'),
    spotifyUsername: document.getElementById('spotify-username'),
    btnGoogleConnect: document.getElementById('btn-google-connect'),
    btnGoogleDisconnect: document.getElementById('btn-google-disconnect'),
    btnSpotifyConnect: document.getElementById('btn-spotify-connect'),
    btnSpotifyDisconnect: document.getElementById('btn-spotify-disconnect'),
    btnDkLogin: document.getElementById('btn-dk-login'),
    btnDkConfirm: document.getElementById('btn-dk-confirm'),
    btnDkDisconnect: document.getElementById('btn-dk-disconnect'),
    // Stats
    statTotal: document.getElementById('stat-total'),
    statLive: document.getElementById('stat-live'),
    statPending: document.getElementById('stat-pending'),
    statNew: document.getElementById('stat-new'),
    // Spotify
    spotifySection: document.getElementById('spotify-section'),
    spotifyReleases: document.getElementById('spotify-releases'),
    btnSpotifyRefresh: document.getElementById('btn-spotify-refresh'),
    // Videos
    videoList: document.getElementById('video-list'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnPrepareAll: document.getElementById('btn-prepare-all'),
    btnUploadReady: document.getElementById('btn-upload-ready'),
    // Detail
    detailSection: document.getElementById('detail-section'),
    btnCloseDetail: document.getElementById('btn-close-detail'),
    btnCheckSpotify: document.getElementById('btn-check-spotify'),
    detailThumbnail: document.getElementById('detail-thumbnail'),
    detailStatusBadge: document.getElementById('detail-status-badge'),
    detailSpotifyStatus: document.getElementById('detail-spotify-status'),
    metaTitle: document.getElementById('meta-title'),
    metaArtist: document.getElementById('meta-artist'),
    metaAlbum: document.getElementById('meta-album'),
    metaGenre: document.getElementById('meta-genre'),
    metaDate: document.getElementById('meta-date'),
    metaLanguage: document.getElementById('meta-language'),
    metaExplicit: document.getElementById('meta-explicit'),
    metaCopyright: document.getElementById('meta-copyright'),
    btnSaveMeta: document.getElementById('btn-save-meta'),
    btnPrepare: document.getElementById('btn-prepare'),
    btnUpload: document.getElementById('btn-upload'),
  };

  // --- Init ---
  async function init() {
    // Handle Spotify OAuth callback
    const spotifyHandled = await Auth.handleSpotifyCallback();
    if (spotifyHandled) showNotice('Spotify connected!');

    loadManualConfig();
    updateAuthUI();
    bindEvents();
    renderVideoList();
    updateStats();
    pollConnectionStatus();
    setInterval(pollConnectionStatus, 15000);

    // Auto-fetch if we have YouTube access
    if (Auth.hasYouTubeAccess()) {
      autoFetchVideos();
    }

    // Auto-init Spotify app token if secrets available
    if (CONFIG.hasSpotify) {
      Auth.ensureSpotifyAppToken();
    }
  }

  function loadManualConfig() {
    // Show current values (masked if from CONFIG)
    if (CONFIG.hasYouTube) {
      els.manualYtKey.placeholder = 'Set via GitHub secrets';
    } else {
      els.manualYtKey.value = localStorage.getItem('songfactory_api_key') || '';
    }

    if (CONFIG.hasYouTubeChannel) {
      els.manualChannelId.placeholder = 'Set via GitHub secrets';
    } else {
      els.manualChannelId.value = localStorage.getItem('songfactory_channel_id') || '';
    }

    els.googleClientId.value = CONFIG.hasGoogleOAuth ? '' : (localStorage.getItem('sf_google_client_id') || '');
    if (CONFIG.hasGoogleOAuth) els.googleClientId.placeholder = 'Set via GitHub secrets';

    els.spotifyClientId.value = CONFIG.hasSpotifyClientOnly ? '' : (localStorage.getItem('sf_spotify_client_id') || '');
    if (CONFIG.hasSpotifyClientOnly) els.spotifyClientId.placeholder = 'Set via GitHub secrets';

    els.localPort.value = localStorage.getItem('songfactory_port') || '3456';
  }

  function bindEvents() {
    // Auth
    els.saveManualConfig.addEventListener('click', handleSaveManualConfig);
    els.btnGoogleConnect.addEventListener('click', handleGoogleConnect);
    els.btnGoogleDisconnect.addEventListener('click', handleGoogleDisconnect);
    els.btnSpotifyConnect.addEventListener('click', handleSpotifyConnect);
    els.btnSpotifyDisconnect.addEventListener('click', handleSpotifyDisconnect);
    els.btnDkLogin.addEventListener('click', () => Auth.openDistroKidLogin());
    els.btnDkConfirm.addEventListener('click', handleDkConfirm);
    els.btnDkDisconnect.addEventListener('click', handleDkDisconnect);

    // Videos
    els.btnRefresh.addEventListener('click', handleRefresh);
    els.btnPrepareAll.addEventListener('click', handlePrepareAll);
    els.btnUploadReady.addEventListener('click', handleUploadReady);
    els.btnCloseDetail.addEventListener('click', () => {
      els.detailSection.classList.add('hidden');
      selectedVideoId = null;
      renderVideoList();
    });
    els.btnSaveMeta.addEventListener('click', handleSaveMetadata);
    els.btnPrepare.addEventListener('click', handlePrepare);
    els.btnUpload.addEventListener('click', handleUpload);

    // Spotify
    els.btnSpotifyRefresh.addEventListener('click', handleSpotifyRefreshReleases);
    els.btnCheckSpotify.addEventListener('click', handleCheckTrackOnSpotify);

    // Type toggle
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  // --- Manual config ---
  function handleSaveManualConfig() {
    const ytKey = els.manualYtKey.value.trim();
    const chId = els.manualChannelId.value.trim();
    if (ytKey) localStorage.setItem('songfactory_api_key', ytKey);
    if (chId) localStorage.setItem('songfactory_channel_id', chId);

    const gClientId = els.googleClientId.value.trim();
    if (gClientId) Auth.setGoogleClientId(gClientId);

    const spClientId = els.spotifyClientId.value.trim();
    if (spClientId) Auth.setSpotifyClientId(spClientId);

    Bridge.setPort(els.localPort.value.trim());
    updateAuthUI();
    showNotice('Configuration saved.');
  }

  // --- Auth handlers ---
  async function handleGoogleConnect() {
    els.btnGoogleConnect.disabled = true;
    els.btnGoogleConnect.textContent = 'Connecting...';
    try {
      await Auth.connectGoogle();
      await YouTubeMonitor.detectChannel();
      updateAuthUI();
      showNotice('YouTube connected!');
      handleRefresh();
    } catch (err) {
      showNotice('Google auth: ' + err.message, true);
    } finally {
      els.btnGoogleConnect.disabled = false;
      els.btnGoogleConnect.textContent = 'Sign in with Google';
    }
  }

  function handleGoogleDisconnect() {
    Auth.disconnectGoogle();
    updateAuthUI();
    showNotice('Google disconnected.');
  }

  async function handleSpotifyConnect() {
    try {
      await Auth.connectSpotify();
    } catch (err) {
      showNotice('Spotify auth: ' + err.message, true);
    }
  }

  function handleSpotifyDisconnect() {
    Auth.disconnectSpotify();
    updateAuthUI();
    showNotice('Spotify disconnected.');
  }

  function handleDkConfirm() {
    Auth.setDistroKidConnected(true);
    updateAuthUI();
    showNotice('DistroKid marked as connected.');
  }

  function handleDkDisconnect() {
    Auth.setDistroKidConnected(false);
    updateAuthUI();
  }

  function updateAuthUI() {
    // --- YouTube ---
    if (Auth.isGoogleConnected()) {
      // Full OAuth
      els.googleStatus.textContent = 'Signed in (OAuth)';
      els.googleStatus.classList.add('auth-connected');
      els.btnGoogleConnect.classList.add('hidden');
      els.btnGoogleDisconnect.classList.remove('hidden');

      const user = Auth.getGoogleUser();
      const channel = YouTubeMonitor.getStoredChannel();
      if (user) {
        els.googleUserInfo.classList.remove('hidden');
        els.googleAvatar.src = user.picture || '';
        els.googleUsername.textContent = user.name || '';
        els.googleChannel.textContent = channel.channelTitle ? `Channel: ${channel.channelTitle}` : '';
      }
    } else if (CONFIG.hasYouTube) {
      // API key from secrets — no login needed
      els.googleStatus.textContent = 'API key configured';
      els.googleStatus.classList.add('auth-connected');
      els.googleUserInfo.classList.add('hidden');

      // Show Google sign-in as optional upgrade if client ID available
      if (Auth.getGoogleClientId()) {
        els.btnGoogleConnect.classList.remove('hidden');
        els.btnGoogleConnect.textContent = 'Upgrade to OAuth';
      } else {
        els.btnGoogleConnect.classList.add('hidden');
      }
      els.btnGoogleDisconnect.classList.add('hidden');
    } else if (Auth.getYouTubeApiKey()) {
      // Manual API key
      els.googleStatus.textContent = 'API key (manual)';
      els.googleStatus.classList.add('auth-connected');
      els.googleUserInfo.classList.add('hidden');
      if (Auth.getGoogleClientId()) {
        els.btnGoogleConnect.classList.remove('hidden');
      }
      els.btnGoogleDisconnect.classList.add('hidden');
    } else {
      // No access
      els.googleStatus.textContent = 'Not configured';
      els.googleStatus.classList.remove('auth-connected');
      els.googleUserInfo.classList.add('hidden');
      if (Auth.getGoogleClientId()) {
        els.btnGoogleConnect.classList.remove('hidden');
      } else {
        els.btnGoogleConnect.classList.add('hidden');
      }
      els.btnGoogleDisconnect.classList.add('hidden');
    }

    // --- Spotify ---
    if (Auth.isSpotifyConnected()) {
      els.spotifyStatus.textContent = 'Signed in (OAuth)';
      els.spotifyStatus.classList.add('auth-connected');
      els.btnSpotifyConnect.classList.add('hidden');
      els.btnSpotifyDisconnect.classList.remove('hidden');
      els.spotifySection.classList.remove('hidden');

      const user = Auth.getSpotifyUser();
      if (user) {
        els.spotifyUserInfo.classList.remove('hidden');
        els.spotifyAvatar.src = user.picture || '';
        els.spotifyUsername.textContent = user.name || '';
      }
    } else if (Auth.hasSpotifyAccess()) {
      // Client Credentials from secrets — no login needed
      els.spotifyStatus.textContent = 'App token configured';
      els.spotifyStatus.classList.add('auth-connected');
      els.spotifySection.classList.remove('hidden');
      els.spotifyUserInfo.classList.add('hidden');

      if (Auth.getSpotifyClientId()) {
        els.btnSpotifyConnect.classList.remove('hidden');
        els.btnSpotifyConnect.textContent = 'Upgrade to user login';
      } else {
        els.btnSpotifyConnect.classList.add('hidden');
      }
      els.btnSpotifyDisconnect.classList.add('hidden');
    } else {
      els.spotifyStatus.textContent = 'Not configured';
      els.spotifyStatus.classList.remove('auth-connected');
      els.spotifySection.classList.add('hidden');
      els.spotifyUserInfo.classList.add('hidden');

      if (Auth.getSpotifyClientId()) {
        els.btnSpotifyConnect.classList.remove('hidden');
        els.btnSpotifyConnect.textContent = 'Sign in to Spotify';
      } else {
        els.btnSpotifyConnect.classList.add('hidden');
      }
      els.btnSpotifyDisconnect.classList.add('hidden');
    }

    // --- DistroKid ---
    if (Auth.isDistroKidConnected()) {
      els.dkStatus.textContent = 'Connected';
      els.dkStatus.classList.add('auth-connected');
      els.btnDkLogin.classList.add('hidden');
      els.btnDkConfirm.classList.add('hidden');
      els.btnDkDisconnect.classList.remove('hidden');
    } else {
      els.dkStatus.textContent = 'Not connected';
      els.dkStatus.classList.remove('auth-connected');
      els.btnDkLogin.classList.remove('hidden');
      els.btnDkConfirm.classList.remove('hidden');
      els.btnDkDisconnect.classList.add('hidden');
    }
  }

  // --- Connection status ---
  async function pollConnectionStatus() {
    const status = await Bridge.checkStatus();
    if (status.online) {
      els.connectionStatus.textContent = 'Local pipeline online';
      els.connectionStatus.className = 'status-online';
    } else {
      els.connectionStatus.textContent = 'Local pipeline offline — start: cd cli && node server.js';
      els.connectionStatus.className = 'status-offline';
    }
  }

  // --- Auto-fetch on load ---
  async function autoFetchVideos() {
    try {
      await YouTubeMonitor.fetchVideos();
      renderVideoList();
      updateStats();
    } catch (err) {
      console.warn('Auto-fetch failed:', err.message);
      renderVideoList(); // Show existing cached videos
    }
  }

  // --- Video list ---
  async function handleRefresh() {
    els.btnRefresh.disabled = true;
    els.btnRefresh.textContent = 'Loading...';
    try {
      await YouTubeMonitor.fetchVideos();
      renderVideoList();
      updateStats();
      showNotice('Videos refreshed.');
    } catch (err) {
      showNotice('Error: ' + err.message, true);
    } finally {
      els.btnRefresh.disabled = false;
      els.btnRefresh.textContent = 'Refresh';
    }
  }

  function renderVideoList() {
    const videos = YouTubeMonitor.getAllVideos();
    const sorted = Object.values(videos).sort(
      (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
    );

    if (sorted.length === 0) {
      let msg;
      if (Auth.hasYouTubeAccess()) {
        msg = 'No videos yet. Click Refresh to fetch from YouTube.';
      } else {
        msg = 'Add YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID to GitHub repo secrets, or sign in with Google.';
      }
      els.videoList.innerHTML = `<p class="empty-state">${msg}</p>`;
      return;
    }

    els.videoList.innerHTML = sorted.map(v => {
      const isSelected = v.videoId === selectedVideoId ? ' selected' : '';
      const badgeClass = getBadgeClass(v.status);
      const typeLabel = v.type === 'skip' ? ' (skip)' : '';
      return `
        <div class="video-item${isSelected}" data-id="${v.videoId}">
          <img class="video-thumb" src="${escapeHtml(v.thumbnail)}" alt="" loading="lazy">
          <div class="video-info">
            <div class="video-title">${escapeHtml(v.title)}</div>
            <div class="video-date">${formatDate(v.publishedAt)}${typeLabel ? `<span class="video-type">${typeLabel}</span>` : ''}</div>
          </div>
          <span class="badge ${badgeClass}">${escapeHtml(v.status)}</span>
        </div>
      `;
    }).join('');

    els.videoList.querySelectorAll('.video-item').forEach(el => {
      el.addEventListener('click', () => selectVideo(el.dataset.id));
    });
  }

  function selectVideo(videoId) {
    selectedVideoId = videoId;
    const videos = YouTubeMonitor.getAllVideos();
    const video = videos[videoId];
    if (!video) return;

    let meta = YouTubeMonitor.getVideoMetadata(videoId);
    if (!meta) {
      meta = MetadataParser.generateMetadata(video);
      YouTubeMonitor.setVideoMetadata(videoId, meta);
    }

    els.detailThumbnail.src = video.thumbnail;
    els.detailStatusBadge.textContent = video.status;
    els.detailStatusBadge.className = 'badge ' + getBadgeClass(video.status);
    els.metaTitle.value = meta.song_title;
    els.metaArtist.value = meta.artist_name;
    els.metaAlbum.value = meta.album_title;
    els.metaGenre.value = meta.genre;
    els.metaDate.value = meta.release_date;
    els.metaLanguage.value = meta.language || 'English';
    els.metaExplicit.checked = meta.explicit;
    els.metaCopyright.value = meta.copyright_holder;
    els.detailSpotifyStatus.classList.add('hidden');

    document.querySelectorAll('input[name="store"]').forEach(cb => {
      cb.checked = (meta.stores || []).includes(cb.value);
    });

    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === video.type);
    });

    els.detailSection.classList.remove('hidden');
    renderVideoList();
  }

  function handleSaveMetadata() {
    if (!selectedVideoId) return;

    const stores = Array.from(document.querySelectorAll('input[name="store"]:checked')).map(cb => cb.value);
    const activeType = document.querySelector('.type-btn.active')?.dataset.type || 'song';

    const meta = {
      artist_name: els.metaArtist.value,
      song_title: els.metaTitle.value,
      album_title: els.metaAlbum.value,
      genre: els.metaGenre.value,
      release_date: els.metaDate.value,
      language: els.metaLanguage.value,
      explicit: els.metaExplicit.checked,
      performer_credits: `${els.metaArtist.value} - AI Music Production`,
      producer_credits: `${els.metaArtist.value} - Self-Produced`,
      copyright_year: new Date().getFullYear(),
      copyright_holder: els.metaCopyright.value,
      stores,
      isrc: 'auto',
      upc: 'auto',
      youtube_video_id: selectedVideoId,
    };

    YouTubeMonitor.setVideoMetadata(selectedVideoId, meta);
    YouTubeMonitor.setVideoType(selectedVideoId, activeType);
    showNotice('Metadata saved.');
    renderVideoList();
  }

  // --- Prepare & Upload ---
  async function handlePrepare() {
    if (!selectedVideoId) return;
    const videos = YouTubeMonitor.getAllVideos();
    const video = videos[selectedVideoId];
    if (!video) return;

    YouTubeMonitor.setVideoStatus(selectedVideoId, 'PREPARING');
    renderVideoList();
    updateStats();

    try {
      const meta = YouTubeMonitor.getVideoMetadata(selectedVideoId);
      await Bridge.extractAudio(selectedVideoId, meta?.song_title || video.title);
      YouTubeMonitor.setVideoStatus(selectedVideoId, 'READY');
      showNotice(`Prepared: ${video.title}`);
    } catch (err) {
      YouTubeMonitor.setVideoStatus(selectedVideoId, 'NEW');
      showNotice('Prepare failed: ' + err.message, true);
    }

    renderVideoList();
    updateStats();
    if (selectedVideoId) selectVideo(selectedVideoId);
  }

  async function handleUpload() {
    if (!selectedVideoId) return;
    const meta = YouTubeMonitor.getVideoMetadata(selectedVideoId);
    if (!meta) {
      showNotice('Save metadata first.', true);
      return;
    }

    if (!Auth.isDistroKidConnected()) {
      showNotice('Connect to DistroKid first.', true);
      return;
    }

    YouTubeMonitor.setVideoStatus(selectedVideoId, 'UPLOADING');
    renderVideoList();
    updateStats();

    try {
      await Bridge.uploadToDistroKid(meta);
      YouTubeMonitor.setVideoStatus(selectedVideoId, 'LIVE');
      showNotice(`Uploaded: ${meta.song_title}`);
    } catch (err) {
      YouTubeMonitor.setVideoStatus(selectedVideoId, 'READY');
      showNotice('Upload failed: ' + err.message, true);
    }

    renderVideoList();
    updateStats();
    if (selectedVideoId) selectVideo(selectedVideoId);
  }

  async function handlePrepareAll() {
    const newVideos = YouTubeMonitor.getVideosByStatus('NEW').filter(v => v.type === 'song');
    if (newVideos.length === 0) {
      showNotice('No new songs to prepare.');
      return;
    }

    for (const video of newVideos) {
      YouTubeMonitor.setVideoStatus(video.videoId, 'PREPARING');
      renderVideoList();
      updateStats();

      try {
        let meta = YouTubeMonitor.getVideoMetadata(video.videoId);
        if (!meta) {
          meta = MetadataParser.generateMetadata(video);
          YouTubeMonitor.setVideoMetadata(video.videoId, meta);
        }
        await Bridge.extractAudio(video.videoId, meta.song_title);
        YouTubeMonitor.setVideoStatus(video.videoId, 'READY');
      } catch (err) {
        YouTubeMonitor.setVideoStatus(video.videoId, 'NEW');
        showNotice(`Failed to prepare ${video.title}: ${err.message}`, true);
      }

      renderVideoList();
      updateStats();
    }

    showNotice(`Prepared ${newVideos.length} songs.`);
  }

  async function handleUploadReady() {
    const readyVideos = YouTubeMonitor.getVideosByStatus('READY');
    if (readyVideos.length === 0) {
      showNotice('No releases ready to upload.');
      return;
    }

    if (!Auth.isDistroKidConnected()) {
      showNotice('Connect to DistroKid first.', true);
      return;
    }

    for (const video of readyVideos) {
      const meta = YouTubeMonitor.getVideoMetadata(video.videoId);
      if (!meta) continue;

      YouTubeMonitor.setVideoStatus(video.videoId, 'UPLOADING');
      renderVideoList();
      updateStats();

      try {
        await Bridge.uploadToDistroKid(meta);
        YouTubeMonitor.setVideoStatus(video.videoId, 'LIVE');
      } catch (err) {
        YouTubeMonitor.setVideoStatus(video.videoId, 'READY');
        showNotice(`Failed to upload ${video.title}: ${err.message}`, true);
      }

      renderVideoList();
      updateStats();
    }

    showNotice('Upload batch complete.');
  }

  // --- Spotify ---
  async function handleSpotifyRefreshReleases() {
    els.btnSpotifyRefresh.disabled = true;
    els.btnSpotifyRefresh.textContent = 'Searching...';

    try {
      const artists = await Auth.searchSpotifyArtist('ThomasTheSolarCryptoEngine');
      if (!artists || artists.length === 0) {
        els.spotifyReleases.innerHTML = '<p class="empty-state">Artist not found on Spotify yet.</p>';
        return;
      }

      const artist = artists[0];
      const releases = await Auth.getSpotifyArtistReleases(artist.id);

      if (!releases || releases.length === 0) {
        els.spotifyReleases.innerHTML = '<p class="empty-state">No releases found on Spotify.</p>';
        return;
      }

      // Cross-reference with YouTube to auto-mark LIVE
      const videos = YouTubeMonitor.getAllVideos();
      for (const vid of Object.values(videos)) {
        const meta = YouTubeMonitor.getVideoMetadata(vid.videoId);
        if (!meta) continue;
        const match = releases.find(r =>
          r.name.toLowerCase().includes(meta.song_title.toLowerCase()) ||
          meta.song_title.toLowerCase().includes(r.name.toLowerCase())
        );
        if (match && vid.status !== 'LIVE') {
          YouTubeMonitor.setVideoStatus(vid.videoId, 'LIVE');
        }
      }

      els.spotifyReleases.innerHTML = releases.map(r => `
        <div class="video-item" style="cursor:default">
          <img class="video-thumb" src="${escapeHtml(r.images?.[r.images.length - 1]?.url || '')}" alt="" loading="lazy">
          <div class="video-info">
            <div class="video-title">${escapeHtml(r.name)}</div>
            <div class="video-date">${r.release_date} &middot; ${r.album_type}</div>
          </div>
          <span class="badge badge-live">LIVE</span>
        </div>
      `).join('');

      renderVideoList();
      updateStats();
      showNotice(`Found ${releases.length} releases on Spotify.`);
    } catch (err) {
      showNotice('Spotify error: ' + err.message, true);
    } finally {
      els.btnSpotifyRefresh.disabled = false;
      els.btnSpotifyRefresh.textContent = 'Check Releases';
    }
  }

  async function handleCheckTrackOnSpotify() {
    if (!selectedVideoId) return;
    if (!Auth.hasSpotifyAccess()) {
      showNotice('Spotify not configured.', true);
      return;
    }

    const meta = YouTubeMonitor.getVideoMetadata(selectedVideoId);
    if (!meta) return;

    els.btnCheckSpotify.disabled = true;
    try {
      const tracks = await Auth.searchSpotifyTrack(meta.song_title, meta.artist_name);
      if (tracks && tracks.length > 0) {
        const track = tracks[0];
        els.detailSpotifyStatus.innerHTML = `
          <span class="spotify-live">LIVE ON SPOTIFY</span>
          <a href="${track.external_urls?.spotify || '#'}" target="_blank" rel="noopener">${escapeHtml(track.name)}</a>
          <span class="spotify-pop">Popularity: ${track.popularity}/100</span>
        `;
        els.detailSpotifyStatus.classList.remove('hidden');
        YouTubeMonitor.setVideoStatus(selectedVideoId, 'LIVE');
        renderVideoList();
        updateStats();
      } else {
        els.detailSpotifyStatus.innerHTML = '<span class="spotify-not-found">Not found on Spotify yet</span>';
        els.detailSpotifyStatus.classList.remove('hidden');
      }
    } catch (err) {
      showNotice('Spotify search failed: ' + err.message, true);
    } finally {
      els.btnCheckSpotify.disabled = false;
    }
  }

  // --- Stats ---
  function updateStats() {
    const videos = Object.values(YouTubeMonitor.getAllVideos()).filter(v => v.type === 'song');
    els.statTotal.textContent = videos.length;
    els.statLive.textContent = videos.filter(v => v.status === 'LIVE').length;
    els.statPending.textContent = videos.filter(v =>
      ['PREPARING', 'READY', 'UPLOADING'].includes(v.status)
    ).length;
    els.statNew.textContent = videos.filter(v => v.status === 'NEW').length;
  }

  // --- Helpers ---
  function getBadgeClass(status) {
    return {
      'NEW': 'badge-new',
      'PREPARING': 'badge-preparing',
      'READY': 'badge-ready',
      'UPLOADING': 'badge-uploading',
      'LIVE': 'badge-live',
      'SKIP': 'badge-skip',
    }[status] || 'badge-new';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function showNotice(msg, isError = false) {
    const existing = document.querySelector('.notice');
    if (existing) existing.remove();

    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.style.cssText = `
      position: fixed; top: 1rem; right: 1rem; z-index: 1000;
      padding: 0.75rem 1.25rem; border-radius: 6px;
      font-family: var(--font-mono); font-size: 0.8rem;
      background: ${isError ? 'rgba(255,107,107,0.9)' : 'rgba(79,195,247,0.9)'};
      color: #000; max-width: 400px;
    `;
    notice.textContent = msg;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 4000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
