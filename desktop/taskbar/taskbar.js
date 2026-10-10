// The taskbar page. It only talks to the app through window.focusBar (see preload.js); the app does the real work
// (Wi-Fi, volume, battery, to-do sync, messages) in its main process.
const B = window.focusBar;
const $ = (id) => document.getElementById(id);

// ---------- icons (inline SVG, stroke = currentColor) ----------
const P = {
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8 M10.3 21a2 2 0 0 0 3.4 0",
  mail: "M3 6h18v12H3z M3 7l9 6 9-6",
  todo: "M9 11l3 3 8-8 M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9",
  lock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14",
  check: "M5 12l5 5 9-10",
  speaker: "M4 9v6h4l5 4V5L8 9z",
  wave1: "M16 9.5a3.5 3.5 0 0 1 0 5",
  wave2: "M18.5 7a7 7 0 0 1 0 10",
  mutex: "M16 9l5 6 M21 9l-5 6",
  bolt: "M13 2L5 14h6l-1 8 8-12h-6z",
  info: "M12 8h.01 M11 12h1v5h1 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18",
  download: "M12 3v12 M7 10l5 5 5-5 M4 21h16",
};
const svg = (names, size = 20, extra = "") => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${[].concat(names).map((n) => `<path d="${P[n]}"/>`).join("")}</svg>`;
/** Wi-Fi icon with 0-4 active arcs. */
function wifiSvg(level, size = 20, slash = false) {
  const arcs = ["M8.5 16.4a5 5 0 0 1 7 0", "M5.5 13.1a9.5 9.5 0 0 1 13 0", "M2.5 9.8a14 14 0 0 1 19 0"];
  const on = Math.max(0, Math.min(3, level - 1));
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round">
    ${arcs.map((d, i) => `<path d="${d}" stroke="currentColor" opacity="${level > 0 && i <= on ? 1 : 0.25}"/>`).join("")}
    <circle cx="12" cy="19.2" r="1.3" fill="currentColor" stroke="none" opacity="${level > 0 ? 1 : 0.35}"/>
    ${slash ? '<path d="M4 4l16 16" stroke="currentColor"/>' : ""}</svg>`;
}
const barsFor = (signal) => (signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : signal > 0 ? 1 : 0);
function batterySvg(pct, charging) {
  const w = Math.max(1, Math.round((pct / 100) * 14));
  return `<svg width="26" height="20" viewBox="0 0 26 20" fill="none"><rect x="1" y="4" width="20" height="12" rx="3" stroke="currentColor" stroke-width="1.8"/><rect x="22.5" y="8" width="2" height="4" rx="1" fill="currentColor"/>
    <rect x="4" y="7" width="${w}" height="6" rx="1.5" fill="currentColor"/>${charging ? '<path d="M12 5l-3 5h3l-1 5 4-6h-3z" fill="#fff" stroke="#00000066" stroke-width=".5"/>' : ""}</svg>`;
}
function volumeSvg(level, muted) {
  const waves = muted ? "mutex" : level > 50 ? ["wave1", "wave2"] : level > 0 ? "wave1" : [];
  return svg(["speaker"].concat(waves), 20);
}

$("ic-bell").innerHTML = svg("bell");
$("ic-mail").innerHTML = svg("mail");
$("ic-todo").innerHTML = svg("todo");

let current = null; // name of the open panel, or null

// ---------- helpers ----------
const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
};
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const setBadge = (id, n) => {
  $(id).hidden = !n;
  $(id).textContent = n > 99 ? "99+" : String(n);
};

// ---------- clock ----------
function tick() {
  const d = new Date();
  $("time").textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  $("date").textContent = d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  if (current === "clock") drawClock();
}
function drawClock() {
  const d = new Date();
  $("clock-big").textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("clock-date").textContent = d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const cal = $("cal");
  if (cal.dataset.day === String(d.getDate()) + d.getMonth()) return;
  cal.dataset.day = String(d.getDate()) + d.getMonth();
  cal.innerHTML = "";
  cal.appendChild(el("div", "cap", esc(d.toLocaleDateString([], { month: "long", year: "numeric" }))));
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  ["M", "T", "W", "T", "F", "S", "S"].forEach((x) => cal.appendChild(el("span", "h", x)));
  for (let i = 0; i < lead; i++) cal.appendChild(el("span", "", ""));
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  for (let n = 1; n <= days; n++) cal.appendChild(el("span", n === d.getDate() ? "today" : "", String(n)));
}
setInterval(tick, 1000);
tick();

// the calendar is drawn when the clock panel opens
let loadersReady = true;

// ---------- panels ----------
const PANELS = { notifs: "panel-notifs", messages: "panel-messages", todo: "panel-todo", wifi: "panel-wifi", volume: "panel-volume", battery: "panel-battery", clock: "panel-clock" };
const loaders = { clock: () => { $('cal').dataset.day = ''; drawClock(); } };

async function openPanel(name) {
  if (current === name) return closePanel();
  if (!current) await B.setOpen(true); // the app enlarges this view so the panel has room above the bar
  if (current) $(PANELS[current]).hidden = true;
  current = name;
  document.querySelectorAll(".tb").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
  $("scrim").hidden = false;
  $(PANELS[name]).hidden = false;
  loaders[name] && loaders[name]();
}
async function closePanel() {
  if (!current) return;
  $(PANELS[current]).hidden = true;
  current = null;
  document.querySelectorAll(".tb").forEach((b) => b.classList.remove("active"));
  $("scrim").hidden = true;
  await B.setOpen(false);
}
document.querySelectorAll(".tb").forEach((b) => b.addEventListener("click", () => openPanel(b.dataset.panel)));
$("scrim").addEventListener("click", closePanel);
document.addEventListener("keydown", (e) => e.key === "Escape" && closePanel());
window.addEventListener("blur", () => setTimeout(() => !document.hasFocus() && closePanel(), 200)); // click on the website closes the panel

// ---------- notifications ----------
let notifs = [];
async function loadNotifs(markRead = false) {
  notifs = await B.notifs.list(markRead);
  const ul = $("notifs-list");
  ul.innerHTML = "";
  $("notifs-empty").hidden = notifs.length > 0;
  for (const n of notifs) {
    const li = el("li", "item" + (n.read ? "" : " unread"), `<span class="dot">${svg(n.kind === "sync" ? "download" : n.kind === "net" ? "globe" : n.kind === "lock" ? "lock" : "info", 18)}</span>
      <div class="body"><div class="t">${esc(n.title)}</div><div class="m">${esc(n.body || "")}</div><div class="when">${ago(n.at)}</div></div>`);
    ul.appendChild(li);
  }
  setBadge("b-notifs", markRead ? 0 : notifs.filter((n) => !n.read).length);
}
loaders.notifs = async () => {
  await loadNotifs(true);
};
$("notifs-clear").addEventListener("click", async () => {
  await B.notifs.clear();
  loadNotifs(true);
});

// ---------- messages ----------
let inbox = { messages: [], unread: 0 };
async function loadMessages() {
  inbox = await B.inbox.list();
  const ul = $("messages-list");
  ul.innerHTML = "";
  $("messages-empty").hidden = inbox.messages.length > 0;
  for (const m of inbox.messages) {
    const tagClass = m.announcement ? "admin" : m.fromRole === "PARENT" ? "parent" : "admin";
    const tag = m.announcement ? "Announcement" : m.fromRole === "PARENT" ? "Parent" : esc(m.fromName || "Admin");
    const li = el("li", "");
    const btn = el("button", "item" + (m.read ? "" : " unread"), `<div class="body"><div class="t"><span class="tag ${tagClass}">${tag}</span></div><div class="m">${esc(m.body)}</div><div class="when">${ago(m.at)}</div></div>`);
    btn.addEventListener("click", async () => {
      if (!m.read) {
        await B.inbox.markRead([m.id]);
        loadMessages();
      }
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
  setBadge("b-messages", inbox.unread);
}
loaders.messages = () => {
  loadMessages();
  B.inbox.refresh().then(loadMessages);
};
$("messages-readall").addEventListener("click", async () => {
  await B.inbox.markRead(inbox.messages.map((m) => m.id));
  loadMessages();
});

// ---------- to-do ----------
async function loadTodo() {
  const { items, pending } = await B.tasks.list();
  const ul = $("todo-list");
  ul.innerHTML = "";
  $("todo-empty").hidden = items.length > 0;
  for (const t of items) {
    const li = el("li", "task" + (t.done ? " done" : ""));
    const chk = el("button", "check" + (t.done ? " on" : ""), t.done ? svg("check", 14) : "");
    chk.setAttribute("aria-label", t.done ? "Mark as not done" : "Mark as done");
    chk.addEventListener("click", async () => {
      await B.tasks.toggle(t.id);
      loadTodo();
    });
    const del = el("button", "del", svg("trash", 16));
    del.setAttribute("aria-label", "Delete task");
    del.addEventListener("click", async () => {
      await B.tasks.remove(t.id);
      loadTodo();
    });
    li.append(chk, el("span", "name", esc(t.title)), del);
    ul.appendChild(li);
  }
  $("todo-sync").textContent = pending ? `${pending} change${pending > 1 ? "s" : ""} waiting to sync` : "Synced";
  setBadge("b-todo", items.filter((t) => !t.done).length);
}
loaders.todo = () => {
  loadTodo();
  setTimeout(() => $("todo-input").focus(), 50);
};
$("todo-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = $("todo-input").value.trim();
  if (!v) return;
  $("todo-input").value = "";
  await B.tasks.add(v);
  loadTodo();
});

// ---------- Wi-Fi ----------
let internetOnline = true;
let wifi = { available: true, connected: false, ssid: "", signal: 0 };
let scanning = false;

function renderWifiButton() {
  const level = wifi.connected ? Math.max(1, barsFor(wifi.signal)) : 0;
  const noInternet = !internetOnline;
  $("ic-wifi").innerHTML = wifiSvg(level, 20, !wifi.available && !noInternet ? false : !wifi.connected && wifi.available);
  $("ic-wifi").style.color = wifi.connected && noInternet ? "var(--warn)" : "";
  $("wifi-label").textContent = wifi.connected ? wifi.ssid : wifi.available ? "Not connected" : noInternet ? "Offline" : "Wired";
  $("wifi-btn").title = wifi.connected ? `${wifi.ssid} — ${noInternet ? "no internet" : "internet available"}` : "Wi-Fi";
}
function renderWifiStatus() {
  const net = internetOnline ? "Internet available" : "No internet connection";
  $("wifi-status").textContent = !wifi.available ? `No Wi-Fi adapter — wired connection. ${net}.` : wifi.connected ? `Connected to ${wifi.ssid} · ${net}` : `Not connected · ${net}`;
  $("wifi-disconnect").hidden = !wifi.connected;
}
async function refreshWifiStatus() {
  wifi = await B.wifi.status();
  renderWifiButton();
  if (current === "wifi") renderWifiStatus();
}

function showWifiError(msg) {
  $("wifi-error").hidden = !msg;
  $("wifi-error").textContent = msg || "";
}

function networkRow(n) {
  const li = el("li", "");
  const btn = el("button", "net" + (n.connected ? " current" : ""), `${wifiSvg(barsFor(n.signal), 22)}
    <span class="name">${esc(n.ssid)}<div class="sub">${n.connected ? "Connected" : n.known ? "Saved" : n.enterprise ? "Not supported (company/school)" : n.secure ? "Secured" : "Open"}</div></span>
    ${n.secure ? svg("lock", 16) : ""}`);
  btn.addEventListener("click", () => {
    showWifiError("");
    if (n.connected || n.enterprise) return;
    if (n.secure && !n.known) {
      // ask for the password inline
      const open = li.querySelector(".pw");
      if (open) return open.remove();
      document.querySelectorAll("#wifi-list .pw").forEach((x) => x.remove());
      const box = el("div", "pw", `<div class="row"><input id="wifi-pass" type="password" placeholder="Network password" autocomplete="off" aria-label="Network password"><button class="chip" id="wifi-show" type="button">Show</button></div>
        <div class="row"><button class="primary" id="wifi-go">Connect</button><button class="chip" id="wifi-cancel" type="button">Cancel</button></div>`);
      li.appendChild(box);
      const pass = box.querySelector("#wifi-pass");
      pass.focus();
      box.querySelector("#wifi-show").addEventListener("click", (e) => {
        pass.type = pass.type === "password" ? "text" : "password";
        e.target.textContent = pass.type === "password" ? "Show" : "Hide";
      });
      box.querySelector("#wifi-cancel").addEventListener("click", () => box.remove());
      const go = () => connectTo(n, pass.value, box.querySelector("#wifi-go"));
      box.querySelector("#wifi-go").addEventListener("click", go);
      pass.addEventListener("keydown", (e) => e.key === "Enter" && go());
    } else connectTo(n, "", btn);
  });
  li.prepend(btn);
  return li;
}

async function connectTo(n, password, control) {
  control.disabled = true;
  const old = control.textContent;
  showWifiError("");
  $("wifi-status").textContent = `Connecting to ${n.ssid}…`;
  const r = await B.wifi.connect({ ssid: n.ssid, password });
  control.disabled = false;
  control.textContent = old;
  if (!r.ok) showWifiError(r.error || "Could not connect.");
  await refreshWifiStatus();
  renderWifiStatus();
  if (r.ok) scanWifi();
}

async function scanWifi() {
  if (scanning) return;
  scanning = true;
  $("wifi-refresh").textContent = "Scanning…";
  const r = await B.wifi.scan();
  scanning = false;
  $("wifi-refresh").textContent = "Refresh";
  const ul = $("wifi-list");
  ul.innerHTML = "";
  $("wifi-empty").hidden = r.ok && r.networks.length > 0;
  $("wifi-empty").textContent = r.ok ? "No networks found nearby." : r.error || "Wi-Fi is not available on this PC.";
  if (r.ok) r.networks.forEach((n) => ul.appendChild(networkRow(n)));
}
loaders.wifi = async () => {
  showWifiError("");
  await refreshWifiStatus();
  renderWifiStatus();
  scanWifi();
};
$("wifi-refresh").addEventListener("click", scanWifi);
$("wifi-disconnect").addEventListener("click", async () => {
  await B.wifi.disconnect();
  await refreshWifiStatus();
  renderWifiStatus();
  scanWifi();
});
setInterval(refreshWifiStatus, 10000);
refreshWifiStatus();

// ---------- volume ----------
let vol = { volume: 0, muted: false, exact: true };
function renderVolume() {
  $("ic-volume").innerHTML = volumeSvg(vol.volume, vol.muted);
  $("vol-mute").innerHTML = volumeSvg(vol.volume, vol.muted);
  $("vol-slider").value = vol.volume;
  $("vol-label").textContent = vol.muted ? "Mute" : `${vol.volume}`;
  $("vol-exact").hidden = !vol.exact;
  $("vol-steps").hidden = vol.exact;
}
async function loadVolume() {
  const r = await B.volume.get();
  if (r.error) {
    vol = { volume: 50, muted: false, exact: false };
  } else vol = { volume: r.volume, muted: r.muted, exact: true };
  renderVolume();
}
loaders.volume = loadVolume;
let volTimer;
$("vol-slider").addEventListener("input", () => {
  vol.volume = Number($("vol-slider").value);
  vol.muted = false;
  renderVolume();
  clearTimeout(volTimer);
  volTimer = setTimeout(() => B.volume.set(vol.volume), 60);
});
$("vol-mute").addEventListener("click", async () => {
  vol.muted = !vol.muted;
  renderVolume();
  await B.volume.mute(vol.muted);
});
document.querySelectorAll("#vol-steps [data-key]").forEach((b) => b.addEventListener("click", () => B.volume.key(b.dataset.key)));
loadVolume();

// ---------- battery (only shown on laptops) ----------
async function loadBattery() {
  const b = await B.battery.get();
  $("battery-btn").hidden = !b.present;
  if (!b.present) return;
  const charging = [2, 6, 7, 8, 9, 11].includes(b.status);
  const full = b.status === 3 || (charging && b.level >= 100);
  $("ic-battery").innerHTML = batterySvg(b.level, charging);
  $("ic-battery").className = b.level <= 15 && !charging ? "low" : charging ? "ok" : "";
  $("battery-label").textContent = `${b.level}%`;
  $("battery-pct").textContent = `${b.level}%`;
  $("battery-text").textContent = full ? "Fully charged" : charging ? "Charging (plugged in)" : b.level <= 15 ? "Low — plug in your charger" : "On battery";
}
loaders.battery = loadBattery;
setInterval(loadBattery, 30000);
loadBattery();

// ---------- ticker in the middle of the bar ----------
let tickerTimer;
function showTicker(html, openName) {
  const t = $("ticker");
  t.innerHTML = html;
  t.hidden = false;
  t.onclick = () => {
    t.hidden = true;
    openName && openPanel(openName);
  };
  clearTimeout(tickerTimer);
  tickerTimer = setTimeout(() => (t.hidden = true), 9000);
}

// ---------- events from the app ----------
B.onEvent((e) => {
  if (e.type === "net") {
    internetOnline = e.online;
    renderWifiButton();
    if (current === "wifi") renderWifiStatus();
  }
  if (e.type === "notif") {
    loadNotifs(current === "notifs");
    showTicker(`<b>${esc(e.item.title)}</b> ${esc(e.item.body || "")}`, "notifs");
  }
  if (e.type === "inbox") {
    setBadge("b-messages", e.unread);
    if (current === "messages") loadMessages();
    const m = e.fresh && e.fresh[0];
    if (m) showTicker(`<b>${m.announcement ? "Announcement" : esc(m.fromRole === "PARENT" ? "Parent" : m.fromName || "Admin")}:</b> ${esc(m.body)}`, "messages");
  }
  if (e.type === "tasks" && current === "todo") loadTodo();
  if (e.type === "tasks") loadTodo();
});

// initial badges
(async () => {
  internetOnline = await B.online();
  renderWifiButton();
  loadNotifs(false);
  loadMessages();
  loadTodo();
  B.inbox.refresh().then(loadMessages);
})();
