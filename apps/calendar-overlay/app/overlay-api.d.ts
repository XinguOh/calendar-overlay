import type { OverlayBridge } from "@repo/calendar"

// preload(contextBridge) 가 노출하는 좁은 API. 브라우저(웹 폴백)에서는 undefined 라 optional.
declare global {
  interface Window {
    overlay?: OverlayBridge
  }
}

export {}
