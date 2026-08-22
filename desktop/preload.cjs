const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("geneiDesktop", {
  isDesktop: true,
  getStatus: () => ipcRenderer.invoke("desktop:status"),
  refreshHardware: () => ipcRenderer.invoke("desktop:refresh-hardware"),
});
