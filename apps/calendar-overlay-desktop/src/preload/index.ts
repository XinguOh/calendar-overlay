import { contextBridge, ipcRenderer } from "electron"

import type {
  AuthStatus,
  EventDraft,
  EventPatch,
  OverlayBridge,
  OverlayState,
  WriteResult,
} from "@repo/calendar"

// renderer 에 노출하는 좁은 API. 토큰 접근 메서드는 없다 — 모든 Google 호출은 main 이 한다.
// 쓰기도 의도(payload)만 보내고 main 이 호출 — 토큰은 어떤 메서드로도 건너오지 않는다.
const bridge: OverlayBridge = {
  getAuthStatus: () => ipcRenderer.invoke("auth:status") as Promise<AuthStatus>,
  signIn: () => ipcRenderer.invoke("auth:signIn") as Promise<AuthStatus>,
  signOut: () => ipcRenderer.invoke("auth:signOut") as Promise<AuthStatus>,
  getOverlayState: () => ipcRenderer.invoke("overlay:get") as Promise<OverlayState>,
  onOverlayStateChanged: (callback) => {
    const handler = (_event: unknown, state: OverlayState) => callback(state)
    ipcRenderer.on("overlay:state", handler)
    return () => {
      ipcRenderer.off("overlay:state", handler)
    }
  },
  onLockChanged: (callback) => {
    const handler = (_event: unknown, locked: boolean) => callback(locked)
    ipcRenderer.on("overlay:locked", handler)
    return () => {
      ipcRenderer.off("overlay:locked", handler)
    }
  },
  toggleLock: () => ipcRenderer.invoke("overlay:toggleLock") as Promise<void>,
  setControlHover: (hovered) => ipcRenderer.send("overlay:controlHover", hovered),
  resizeTo: (height) => ipcRenderer.send("overlay:resize", height),
  getOpacity: () => ipcRenderer.invoke("overlay:getOpacity") as Promise<number>,
  saveOpacity: (value: number) => ipcRenderer.send("overlay:saveOpacity", value),
  createEvent: (draft: EventDraft) =>
    ipcRenderer.invoke("calendar:create", draft) as Promise<WriteResult>,
  updateEvent: (patch: EventPatch) =>
    ipcRenderer.invoke("calendar:update", patch) as Promise<WriteResult>,
  moveEvent: (patch: EventPatch) =>
    ipcRenderer.invoke("calendar:move", patch) as Promise<WriteResult>,
  deleteEvent: (id: string, calendarId: string) =>
    ipcRenderer.invoke("calendar:delete", id, calendarId) as Promise<WriteResult>,
  refreshNow: () => ipcRenderer.invoke("overlay:refresh") as Promise<void>,
}

contextBridge.exposeInMainWorld("overlay", bridge)

// 네트워크 복구 시 갱신 트리거 (main 의 5분 주기/절전복귀 외 보강). 토큰과 무관한 내부 신호.
window.addEventListener("online", () => ipcRenderer.send("overlay:online"))
