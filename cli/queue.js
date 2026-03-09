const { uploadToDistroKid } = require('./upload');

/**
 * Sequential upload queue.
 * DistroKid uploads are processed one at a time to avoid session conflicts.
 */

const queue = [];
let processing = false;
let completedJobs = [];
let jobCounter = 0;

function enqueueUpload(metadata, bundlesDir) {
  jobCounter++;
  const job = {
    id: `job_${jobCounter}_${Date.now()}`,
    metadata,
    bundlesDir,
    status: 'queued',
    createdAt: new Date().toISOString(),
    completedAt: null,
    error: null,
  };
  queue.push(job);
  processNext();
  return job.id;
}

async function processNext() {
  if (processing || queue.length === 0) return;

  processing = true;
  const job = queue.shift();
  job.status = 'processing';

  console.log(`Processing upload: ${job.metadata.song_title} (${job.id})`);

  try {
    await uploadToDistroKid(job.metadata, job.bundlesDir);
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    console.log(`Upload completed: ${job.metadata.song_title}`);
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    job.completedAt = new Date().toISOString();
    console.error(`Upload failed: ${job.metadata.song_title} — ${err.message}`);
  }

  completedJobs.push(job);
  // Keep only last 50 completed jobs
  if (completedJobs.length > 50) {
    completedJobs = completedJobs.slice(-50);
  }

  processing = false;
  processNext();
}

function getQueueStatus() {
  return {
    pending: queue.length,
    processing,
    completed: completedJobs.length,
    jobs: [
      ...queue.map(j => ({ id: j.id, title: j.metadata.song_title, status: j.status })),
      ...completedJobs.slice(-10).map(j => ({
        id: j.id,
        title: j.metadata.song_title,
        status: j.status,
        error: j.error,
        completedAt: j.completedAt,
      })),
    ],
  };
}

module.exports = { enqueueUpload, getQueueStatus };
