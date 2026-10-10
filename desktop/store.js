// Small crash-safe JSON store for everything the app keeps on disk while offline:
// the queue of finished sessions waiting to sync, the active offline session, and the cached profile.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function createStore(dir, getKey) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (name) => path.join(dir, name);

  function read(name, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file(name), "utf8"));
    } catch {
      return fallback;
    }
  }
  function write(name, data) {
    const tmp = file(name) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file(name)); // atomic: a power cut never leaves a half-written file
  }

  // Signature over the fields that matter. The server recomputes it with the same key, so a record edited by hand
  // (more minutes, other user…) is rejected at sync time.
  const sign = (r) =>
    crypto
      .createHmac("sha256", getKey())
      .update([r.clientId, r.userId, r.kind, r.subject, r.startedAt, r.plannedSec, r.runSec, r.wallSec, r.violations, r.runId ?? ""].join("|"))
      .digest("hex");

  const readQueue = () => {
    const q = read("queue.json", {});
    return { sessions: Array.isArray(q.sessions) ? q.sessions : [], events: Array.isArray(q.events) ? q.events : [] };
  };
  const writeQueue = (q) => write("queue.json", q);

  return {
    read,
    write,
    sign,
    readQueue,
    writeQueue,
    addSession(rec) {
      const q = readQueue();
      q.sessions.push({ ...rec, sig: sign(rec) });
      writeQueue(q);
    },
    addEvent(kind, at = Date.now()) {
      const q = readQueue();
      q.events.push({ kind, at });
      q.events = q.events.slice(-100);
      writeQueue(q);
    },
    pendingCount: () => readQueue().sessions.length,
  };
}

module.exports = { createStore };
