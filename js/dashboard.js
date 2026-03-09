/**
 * Dashboard UI controller.
 * Wires up the YouTube monitor, metadata parser, and bridge modules.
 */
(() => {
  let selectedVideoId = null;
  let statusPollInterval = null;

  // --- DOM refs ---
  const els = {
    apiKey: document.getElementById('api-key'),
    channelId: document.getElementById('channel-id'),
    localPort: document.getElementById('local-port'),
    saveConfig: document.getElementById('save-config'),
    connectionStatus: document.getElementById('connection-status'),
    statTotal: document.getElementById('stat-total'),
    statLive: document.getElementById('stat-live'),
    statPending: document.getElementById('stat-pending'),
    statNew: document.getElementById('stat-new'),
    videoList: document.getElementById('video-list'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnPrepareAll: document.getElementById('btn-prepare-all'),
    btnUploadReady: document.getElementById('btn-upload-ready'),
    detailSection: document.getElementById('detail-section'),
    btnCloseDetail: document.getElementById('btn-close-detail'),
    detailThumbnail: document.getElementById('detail-thumbnail'),
    detailStatusBadge: document.getElementById('detail-status-badge'),
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
  function init() {
    loadConfig();
    bindEvents();
    renderVideoList();
    updateStats();
    pollConnectionStatus();
    statusPollInterval = setInterval(pollConnectionStatus, 15000);
  }

  function loadConfig() {
    const config = YouTubeMonitor.getConfig();
    els.apiKey.value = config.apiKey;
    els.channelId.value = config.channelId;
    els.localPort.value = localStorage.getItem('songfactory_port') || '3456';
  }

  function bindEvents() {
    els.saveConfig.addEventListener('click', handleSaveConfig);
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

    // Type toggle buttons
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  // --- Config ---
  function handleSaveConfig() {
    YouTubeMonitor.saveConfig(els.apiKey.value.trim(), els.channelId.value.trim());
    Bridge.setPort(els.localPort.value.trim());
    showNotice('Configuration saved.');
  }

  // --- Connection status ---
  async function pollConnectionStatus() {
    const status = await Bridge.checkStatus();
    if (status.online) {
      els.connectionStatus.textContent = 'Local pipeline online';
      els.connectionStatus.className = 'status-online';
    } else {
      els.connectionStatus.textContent = 'Local pipeline offline — start song-factory serve';
      els.connectionStatus.className = 'status-offline';
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
      els.videoList.innerHTML = '<p class="empty-state">No videos yet. Click Refresh to fetch from YouTube.</p>';
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

    // Bind click events
    els.videoList.querySelectorAll('.video-item').forEach(el => {
      el.addEventListener('click', () => selectVideo(el.dataset.id));
    });
  }

  function selectVideo(videoId) {
    selectedVideoId = videoId;
    const videos = YouTubeMonitor.getAllVideos();
    const video = videos[videoId];
    if (!video) return;

    // Generate metadata if not already done
    let meta = YouTubeMonitor.getVideoMetadata(videoId);
    if (!meta) {
      meta = MetadataParser.generateMetadata(video);
      YouTubeMonitor.setVideoMetadata(videoId, meta);
    }

    // Fill detail form
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

    // Set stores
    document.querySelectorAll('input[name="store"]').forEach(cb => {
      cb.checked = (meta.stores || []).includes(cb.value);
    });

    // Set type toggle
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
    selectVideo(selectedVideoId);
  }

  async function handleUpload() {
    if (!selectedVideoId) return;
    const meta = YouTubeMonitor.getVideoMetadata(selectedVideoId);
    if (!meta) {
      showNotice('Save metadata first.', true);
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
    selectVideo(selectedVideoId);
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

    showNotice(`Upload batch complete.`);
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
    const map = {
      'NEW': 'badge-new',
      'PREPARING': 'badge-preparing',
      'READY': 'badge-ready',
      'UPLOADING': 'badge-uploading',
      'LIVE': 'badge-live',
      'SKIP': 'badge-skip',
    };
    return map[status] || 'badge-new';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function showNotice(msg, isError = false) {
    // Simple notification — insert at top of app
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

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
