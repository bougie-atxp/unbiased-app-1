import { contextBridge, ipcRenderer } from "electron";
import type { PalSelection } from "../shared/pals";

type PetUpdate = {
  state: "idle" | "working" | "done" | "failed";
  runningCount: number;
  completedActions: number;
  completedThreads: number;
  inFlightActions: number;
  selection: PalSelection;
  scale: number;
};

contextBridge.exposeInMainWorld("pet", {
  onUpdate: (callback: (value: PetUpdate) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: PetUpdate) => callback(value);
    ipcRenderer.on("pet:update", listener);
    return () => ipcRenderer.removeListener("pet:update", listener);
  },
  onHover: (callback: (hovered: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, hovered: boolean) => callback(hovered);
    ipcRenderer.on("pet:hover", listener);
    return () => ipcRenderer.removeListener("pet:hover", listener);
  },
  onMotion: (callback: (direction: "left" | "right" | "up" | "down" | null) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, direction: "left" | "right" | "up" | "down" | null) => callback(direction);
    ipcRenderer.on("pet:motion", listener);
    return () => ipcRenderer.removeListener("pet:motion", listener);
  },
  ready: () => ipcRenderer.send("pet:ready"),
  menu: () => ipcRenderer.send("pet:menu"),
});
