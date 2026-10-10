// Offline screen. All real work (timing, locking, saving, syncing) happens in the app's main process;
// this page only displays the state and sends button presses through window.focusShell.
const S = window.focusShell;
const $ = (id) => document.getElementById(id);
const CIRC = 326.7;
let minutes = 25;
let profile = null;

const mmss = (s) => {
  s = Math.max(0, Math.round(s));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const show = (el, on) => (el.hidden = !on);

async function loadProfile() {
  profile = await S.offline.profile();
  show($("noprofile"), !profile);
  show($("content"), !!profile);
  if (profile) {
    $("hello").textContent = `Hi ${profile.user.name.split(" ")[0]} — you are studying offline. Sessions are saved on this PC and sync automatically when the internet returns.`;
    $("strict-note").textContent = profile.user.strictMode >= 1 ? "🔒 Strict mode: the screen locks until the timer ends. Stopping early needs a code from your parent or admin." : "";
  }
}


// ----- timer UI -----
$("presets").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  minutes = Number(b.dataset.min);
  $("custom").value = "";
  document.querySelectorAll("#presets .chip").forEach((c) => c.classList.toggle("active", c === b));
});
$("custom").addEventListener("input", () => {
  const v = Number($("custom").value);
  if (v > 0) {
    minutes = Math.min(360, Math.floor(v));
    document.querySelectorAll("#presets .chip").forEach((c) => c.classList.remove("active"));
  }
});
$("start").addEventListener("click", async () => {
  $("start-error").hidden = true;
  const r = await S.offline.start({ subject: $("subject").value, minutes });
  if (!r.ok) {
    $("start-error").textContent = r.error || "Could not start.";
    $("start-error").hidden = false;
  }
});
$("resume").addEventListener("click", () => S.offline.resume());
$("stop").addEventListener("click", async () => {
  $("stop-error").hidden = true;
  const r = await S.offline.stop($("code").value);
  if (!r.ok) {
    $("stop-error").textContent = r.error || "Wrong code.";
    $("stop-error").hidden = false;
  } else $("code").value = "";
});
$("retry").addEventListener("click", async () => {
  $("retry").disabled = true;
  await S.offline.retry();
  $("retry").disabled = false;
});
$("go-online").addEventListener("click", () => S.offline.goOnline());

let toastTimer;
function toast(text) {
  $("toast").textContent = text;
  show($("toast"), true);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => show($("toast"), false), 9000);
}

let lastFinishedAt = 0;
async function refresh() {
  const st = await S.offline.state();
  $("pending").textContent = st.pending ? `${st.pending} session${st.pending > 1 ? "s" : ""} waiting to sync` : "";
  show($("idle"), !st.active);
  show($("running"), st.active);
  show($("lock"), st.active && st.locked && !st.running);
  $("start").disabled = !profile;

  if (st.active) {
    const left = st.plannedSec - st.elapsedSec;
    $("clock").textContent = mmss(left);
    $("lock-clock").textContent = mmss(left);
    $("arc").style.strokeDashoffset = String(CIRC * (1 - Math.min(1, st.elapsedSec / st.plannedSec)));
    $("status").textContent = st.running ? (st.locked ? "🔒 locked" : "running") : "paused";
    $("what").textContent = st.subject;
    $("stop-help").textContent = st.strict >= 1 ? "Ask your parent or admin for the offline code (they can see it in the admin panel) and enter it here." : "Stopping now saves the time you have studied.";
    $("stop").textContent = st.strict >= 1 ? "Unlock & stop" : "Stop";
    $("code").hidden = st.strict < 1;
    if (st.lockedOutUntil > Date.now()) {
      $("stop-error").textContent = `Too many wrong codes. Try again in ${Math.ceil((st.lockedOutUntil - Date.now()) / 60000)} min.`;
      $("stop-error").hidden = false;
    }
  }
  if (st.lastFinished && st.lastFinished.at !== lastFinishedAt) {
    lastFinishedAt = st.lastFinished.at;
    toast(st.lastFinished.saved ? `✅ ${Math.round(st.lastFinished.runSec / 60) || "<1"} min of ${st.lastFinished.subject} saved. It will sync when you are online.` : "Session was too short to save.");
  }
}

function setNet(online) {
  $("net").textContent = online ? "Online" : "Offline";
  $("net").className = "pill " + (online ? "on" : "off");
}

S.offline.onEvent(async (e) => {
  if (e.type === "net") {
    setNet(e.online);
    show($("online-banner"), e.online);
  }
  if (e.type === "synced") toast(`☁️ ${e.count} offline session${e.count > 1 ? "s" : ""} synced to your account.`);
  if (e.type === "profile") await loadProfile();
});

(async () => {
  await loadProfile();
  const st = await S.offline.state();
  setNet(!!st.online);
  setInterval(refresh, 500);
  refresh();
})();
