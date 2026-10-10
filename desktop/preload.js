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
  // Lets the website put a line in the taskbar's notification list (e.g. "Focus session complete").
  notify: (title, body) => call("shell:notify", String(title || "").slice(0, 80), String(body || "").slice(0, 160)),


  // A locked block ended while the server was unreachable: the app records it and syncs later.
  offlineComplete: (s) => call("offline:complete", s),

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
  wifi: {
    status: () => call("wifi:status"),
    scan: () => call("wifi:scan"),
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
