// Runs in the page's isolated world and exposes small, safe APIs: window.focusShell (website + offline screen) and
// window.focusBar (the taskbar). The main process checks which page is calling before it does anything.
const { contextBridge, ipcRenderer } = require("electron");

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const listen = (channel, cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("focusShell", {
  isDesktop: true,
  lock: () => call("shell:lock"),
  unlock: () => call("shell:unlock"),
  status: () => call("shell:status"),
  // The app tells the page when the window lost focus while locked (Alt+Tab, Win key, ...).
  onViolation: (cb) => listen("shell:violation", cb),
  // The website reports its Pomodoro timer so the taskbar can show it, and receives Start/Pause clicks from the taskbar.
  timerUpdate: (t) => call("shell:timer-update", t),
  onTimerCommand: (cb) => listen("shell:timer-command", cb),
  // The taskbar's "Windows button" (bottom-left) asking the website to open/close its navigation menu.
  // Lets the website put a line in the taskbar's notification list (e.g. "Focus session complete").
  notify: (title, body) => call("shell:notify", String(title || "").slice(0, 80), String(body || "").slice(0, 160)),


  // A locked block ended while the server was unreachable: the app records it and syncs later.
  offlineComplete: (s) => call("offline:complete", s),

  // Opens an admin-approved course site in place of the website (locked to that domain). The app itself checks
  // the domain is actually approved and that no strict-mode block is running before it navigates anywhere.
  openCourseSite: (domain, title) => call("shell:open-course", String(domain || ""), String(title || "")),
  openGmail: () => call("shell:open-gmail"),
  // "My Files": a gallery inside the app itself. listFiles() returns names the website turns into
  // focusfile://local/<name> image URLs; deleteFile() removes one.
  listFiles: () => call("shell:list-files"),
  deleteFile: (name) => call("shell:delete-file", String(name || "")),

  // Offline study screen
  offline: {
    profile: () => call("offline:profile"),
    state: () => call("offline:state"),
    start: (opts) => call("offline:start", opts),
    resume: () => call("offline:resume"),
    stop: (code) => call("offline:stop", code),
    retry: () => call("offline:retry"),
    goOnline: () => call("offline:goOnline"),
    onEvent: (cb) => listen("offline:event", cb),
  },
});

// Taskbar API (only answered for the bundled taskbar page).
contextBridge.exposeInMainWorld("focusBar", {
  setOpen: (open) => call("bar:setOpen", !!open),
  online: () => call("bar:online"),
  onEvent: (cb) => listen("bar:event", cb),
  course: {
    list: () => call("course:list"),
    toggle: (domain) => call("course:toggle", String(domain || "")),
    close: (domain) => call("course:close", String(domain || "")),
  },
  wifi: {
    status: () => call("wifi:status"),
    scan: (opts) => call("wifi:scan", opts && { fresh: !!opts.fresh }),
    connect: (opts) => call("wifi:connect", opts),
    disconnect: () => call("wifi:disconnect"),
  },
  volume: {
    get: () => call("volume:get"),
    set: (n) => call("volume:set", n),
    mute: (m) => call("volume:mute", m),
    key: (which) => call("volume:key", which),
  },
  battery: { get: () => call("battery:get") },
  timer: { get: () => call("timer:get"), toggle: () => call("timer:toggle") },
  home: { go: () => call("home:go") },
  screenshot: { take: () => call("screenshot:take") },
  power: { shutdown: () => call("power:shutdown"), restart: () => call("power:restart") },
  tasks: {
    list: () => call("tasks:list"),
    add: (title) => call("tasks:add", title),
    toggle: (id) => call("tasks:toggle", id),
    remove: (id) => call("tasks:remove", id),
  },
  inbox: {
    list: () => call("inbox:list"),
    refresh: () => call("inbox:refresh"),
    markRead: (ids) => call("inbox:markRead", ids),
  },
  notifs: {
    list: (markRead) => call("notifs:list", !!markRead),
    clear: () => call("notifs:clear"),
  },
});
