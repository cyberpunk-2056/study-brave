// Offline study sessions. The MAIN process owns the timing, not the web page, and it measures time on a monotonic
// clock (process.hrtime), so changing the Windows clock cannot add minutes. Finished sessions are signed and queued
// for sync (see store.js). Time while the PC was off, or the window lost focus, is never counted.
const crypto = require("node:crypto");

const mono = () => Number(process.hrtime.bigint() / 1000000n); // milliseconds, unaffected by clock changes
const PERSIST_EVERY_MS = 5000;

class OfflineSessions {
  constructor({ store, appVersion }) {
    this.store = store;
    this.appVersion = appVersion;
    this.active = null;
    this.lastFinished = null;
    this.lastPersist = 0;
    this.wasRunningAtRestore = false;
  }

  elapsedMs() {
    const a = this.active;
    if (!a) return 0;
    return a.runMs + (a.segStart != null ? mono() - a.segStart : 0);
  }

  state() {
    const a = this.active;
    return {
      active: !!a,
      running: !!a && a.segStart != null,
      elapsedSec: a ? Math.floor(this.elapsedMs() / 1000) : 0,
      plannedSec: a?.plannedSec ?? 0,
      subject: a?.subject ?? "",
      strict: a?.strict ?? 0,
      locked: !!a && a.strict >= 1,
      violations: a?.violations ?? 0,
      lockedOutUntil: a?.lockUntil ?? 0,
      lastFinished: this.lastFinished && Date.now() - this.lastFinished.at < 15000 ? this.lastFinished : null,
      pending: this.store.pendingCount(),
    };
  }

  start({ userId, subject, plannedSec, strict }) {
    if (this.active) return { ok: false, error: "A session is already running." };
    if (!Number.isFinite(plannedSec) || plannedSec < 60 || plannedSec > 6 * 3600) return { ok: false, error: "Choose between 1 minute and 6 hours." };
    this.active = {
      clientId: crypto.randomUUID(),
      userId,
      subject: String(subject || "General").trim().slice(0, 40) || "General",
      plannedSec: Math.floor(plannedSec),
      startedAt: Date.now(),
      runMs: 0,
      segStart: mono(),
      violations: 0,
      strict,
      attempts: 0,
      lockUntil: 0,
    };
    this.persist(true);
    return { ok: true };
  }

  resume() {
    const a = this.active;
    if (a && a.segStart == null) a.segStart = mono();
    this.persist(true);
  }

  pause(violation = false) {
    const a = this.active;
    if (!a || a.segStart == null) return false;
    a.runMs += mono() - a.segStart;
    a.segStart = null;
    if (violation) a.violations += 1;
    this.persist(true);
    return true;
  }

  /** Called every ~500 ms. Returns the saved record when the planned time has been reached. */
  tick() {
    const a = this.active;
    if (!a) return null;
    if (a.segStart != null && this.elapsedMs() >= a.plannedSec * 1000) return this.finish();
    this.persist(false);
    return null;
  }

  /** Ends the session (finished, or stopped early with an unlock code) and queues the signed record. */
  finish() {
    const a = this.active;
    if (!a) return null;
    const runSec = Math.min(Math.floor(this.elapsedMs() / 1000), a.plannedSec);
    const rec = {
      clientId: a.clientId,
      userId: a.userId,
      kind: "FOCUS",
      subject: a.subject,
      startedAt: a.startedAt,
      plannedSec: a.plannedSec,
      runSec,
      wallSec: Math.max(0, Math.floor((Date.now() - a.startedAt) / 1000)),
      violations: a.violations,
      runId: null,
      appVersion: this.appVersion,
    };
    if (runSec >= 10) this.store.addSession(rec);
    this.active = null;
    this.store.write("active.json", {});
    this.lastFinished = { at: Date.now(), runSec, saved: runSec >= 10, subject: rec.subject };
    return rec;
  }

  /** The website could not reach the server when a locked block ended; record it from the app's own lock timing. */
  recordFromLock({ userId, subject, plannedSec, claimedSec, runId, lockedSince, lockedMonoMs }) {
    const lockedSec = Math.floor(lockedMonoMs / 1000);
    const runSec = Math.max(0, Math.min(Math.floor(claimedSec), plannedSec, lockedSec + 5));
    const rec = {
      clientId: crypto.randomUUID(),
      userId,
      kind: "FOCUS",
      subject: String(subject || "General").trim().slice(0, 40) || "General",
      startedAt: lockedSince,
      plannedSec: Math.floor(plannedSec),
      runSec,
      wallSec: Math.max(0, Math.floor((Date.now() - lockedSince) / 1000)),
      violations: 0,
      runId: typeof runId === "string" && /^[\w-]{8,64}$/.test(runId) ? runId : null,
      appVersion: this.appVersion,
    };
    if (rec.plannedSec < 60 || runSec < 10) return { ok: false, error: "Nothing to record." };
    this.store.addSession(rec);
    this.lastFinished = { at: Date.now(), runSec, saved: true, subject: rec.subject };
    return { ok: true };
  }

  persist(force) {
    const a = this.active;
    if (!a) return;
    const now = Date.now();
    if (!force && now - this.lastPersist < PERSIST_EVERY_MS) return;
    this.lastPersist = now;
    this.store.write("active.json", { ...a, runMs: this.elapsedMs(), segStart: null, wasRunning: a.segStart != null });
  }

  /** After the app (or the PC) was restarted: continue from the last saved point; the time off earns nothing. */
  restore() {
    const saved = this.store.read("active.json", {});
    if (!saved || !saved.clientId) return { restored: false };
    this.active = { ...saved, segStart: null };
    this.wasRunningAtRestore = !!saved.wasRunning;
    this.store.addEvent("APP_RESTARTED");
    return { restored: true, wasRunning: this.wasRunningAtRestore };
  }
}

module.exports = { OfflineSessions, mono };
