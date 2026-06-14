import { powerMonitor } from "electron"

import { refreshState } from "./overlay-state"

// 5분 주기 + 앱 시작 + 절전 복귀. 네트워크 복구는 preload 가 보내는 overlay:online 으로 보강(main/index).

const REFRESH_MS = 5 * 60_000
let timer: ReturnType<typeof setInterval> | null = null

export function startRefreshLoop(): void {
  void refreshState()
  timer = setInterval(() => void refreshState(), REFRESH_MS)
  powerMonitor.on("resume", () => void refreshState())
}

export function triggerRefresh(): void {
  void refreshState()
}

export function stopRefreshLoop(): void {
  if (timer) clearInterval(timer)
  timer = null
}
