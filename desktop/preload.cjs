const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("geneiDesktop", {
  isDesktop: true,
  getStatus: () => ipcRenderer.invoke("desktop:status"),
  refreshHardware: () => ipcRenderer.invoke("desktop:refresh-hardware"),
  termsStatus: () => ipcRenderer.invoke("desktop:terms-status"),
  systemMemory: () => ipcRenderer.invoke("desktop:system-memory"),
  acceptTerms: () => ipcRenderer.send("desktop:terms-accept"),
  declineTerms: () => ipcRenderer.send("desktop:terms-decline"),
});
