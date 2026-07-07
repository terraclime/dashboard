import { randomUUID } from "crypto";

// In-memory job store for tracking bulk bill-send progress.
// Jobs are lost on server restart — acceptable for a demo/single-instance setup.

/** @type {Map<string, object>} */
const jobs = new Map();

/**
 * Create a new job and return its ID.
 * @param {string} cycleId
 * @param {number} total  - total number of flats to process
 * @returns {string} jobId
 */
export function createJob(cycleId, total) {
  const jobId = randomUUID();
  jobs.set(jobId, {
    jobId,
    cycleId,
    total,
    sent: 0,
    failed: 0,
    errors: [],
    status: "pending",
    createdAt: new Date().toISOString(),
    completedAt: null,
  });
  return jobId;
}

/**
 * Retrieve a job by ID. Returns null if not found.
 * @param {string} jobId
 */
export function getJob(jobId) {
  return jobs.get(jobId) ?? null;
}

/**
 * Merge arbitrary fields into a job.
 * @param {string} jobId
 * @param {object} data
 */
export function updateJob(jobId, data) {
  const job = jobs.get(jobId);
  if (job) jobs.set(jobId, { ...job, ...data });
}

/**
 * Mark a job as successfully completed.
 * @param {string} jobId
 */
export function markJobDone(jobId) {
  updateJob(jobId, { status: "done", completedAt: new Date().toISOString() });
}

/**
 * Mark a job as failed with a reason.
 * @param {string} jobId
 * @param {string} message
 */
export function markJobFailed(jobId, message) {
  updateJob(jobId, {
    status: "failed",
    failureReason: message,
    completedAt: new Date().toISOString(),
  });
}

/**
 * Record a per-flat mail error and increment the failed counter.
 * @param {string} jobId
 * @param {string} flatId
 * @param {string} email
 * @param {string} message
 */
export function recordMailError(jobId, flatId, email, message) {
  const job = jobs.get(jobId);
  if (job) {
    job.errors.push({ flatId, email, message, ts: new Date().toISOString() });
    job.failed += 1;
  }
}

/**
 * Increment the sent counter for a job.
 * @param {string} jobId
 */
export function incrementSent(jobId) {
  const job = jobs.get(jobId);
  if (job) job.sent += 1;
}
