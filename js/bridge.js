/**
 * Bridge module — communicates with the local song-factory-cli server.
 * The dashboard (GitHub Pages) calls localhost for heavy operations:
 *   - Audio extraction (yt-dlp)
 *   - DistroKid upload (Playwright)
 *   - Pipeline status
 */
const Bridge = (() => {
  const PORT_KEY = 'songfactory_port';

  function getBaseUrl() {
    const port = localStorage.getItem(PORT_KEY) || '3456';
    return `http://localhost:${port}`;
  }

  function setPort(port) {
    localStorage.setItem(PORT_KEY, String(port));
  }

  async function checkStatus() {
    try {
      const resp = await fetch(`${getBaseUrl()}/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      if (!resp.ok) return { online: false };
      const data = await resp.json();
      return { online: true, ...data };
    } catch {
      return { online: false };
    }
  }

  async function extractAudio(videoId, title) {
    const resp = await fetch(`${getBaseUrl()}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, title }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Extract failed: ${resp.status}`);
    }
    return resp.json();
  }

  async function uploadToDistroKid(metadata) {
    const resp = await fetch(`${getBaseUrl()}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Upload failed: ${resp.status}`);
    }
    return resp.json();
  }

  async function getReleases() {
    const resp = await fetch(`${getBaseUrl()}/releases`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      throw new Error(`Failed to get releases: ${resp.status}`);
    }
    return resp.json();
  }

  async function getQueueStatus() {
    const resp = await fetch(`${getBaseUrl()}/queue`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      throw new Error(`Failed to get queue: ${resp.status}`);
    }
    return resp.json();
  }

  return {
    getBaseUrl,
    setPort,
    checkStatus,
    extractAudio,
    uploadToDistroKid,
    getReleases,
    getQueueStatus,
  };
})();
