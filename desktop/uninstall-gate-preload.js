const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gate", {
  check: (code) => ipcRenderer.invoke("gate:check", code),
  cancel: () => ipcRenderer.invoke("gate:cancel"),
});
