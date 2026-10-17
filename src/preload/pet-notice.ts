import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("petNotice", {
  dismiss: (id: number) => ipcRenderer.send("pet:notice-dismiss", id),
  open: (id: number) => ipcRenderer.send("pet:notice-open", id),
  onUpdate: (callback: (value: { id: number; title: string; response: string }[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: { id: number; title: string; response: string }[]) => callback(value);
    ipcRenderer.on("pet:notice", listener);
    return () => ipcRenderer.removeListener("pet:notice", listener);
  },
});
