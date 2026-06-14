import { BrowserWindow } from "electron"

import type { OverlayState } from "@repo/calendar"
import { layoutDay, selectOverlay } from "@repo/calendar"

import { getAuthStatus } from "./auth"
import { fetchEvents } from "./calendar"

// 현재 OverlayState 의 단일 소유처. 캘린더 결과 + selectOverlay 로 조립해 모든 창에 push.

// 기본 잠금(완전 클릭 통과 패시브 HUD). 해제는 globalShortcut·Tray 로만.
let locked = true
let current: OverlayState = { status: "loading", locked: true }

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("overlay:state", current)
  }
}

export function getState(): OverlayState {
  return current
}

/** 잠금 상태 토글 — 캘린더 재요청 없이 상태에 병합만 한다. */
export function setLocked(value: boolean): void {
  locked = value
  current = { ...current, locked }
  broadcast()
}

export async function refreshState(now: Date = new Date()): Promise<void> {
  if (!getAuthStatus().signedIn) {
    current = { status: "unauthenticated", locked }
    broadcast()
    return
  }
  try {
    const events = await fetchEvents(now)
    const selection = selectOverlay(events, now)
    // fetchEvents 가 primary 캘린더 id(accountEmail)를 채운 뒤 auth 조회 → email·canWrite 최신.
    const auth = getAuthStatus()
    current = {
      status: "ready",
      locked,
      lastSyncedAt: now.toISOString(),
      now: selection.now,
      day: layoutDay(events, now),
      canWrite: auth.canWrite,
      email: auth.email,
    }
  } catch (error) {
    current = { status: "error", message: describe(error), locked }
  }
  broadcast()
}

function describe(error: unknown): string {
  if (error instanceof Error && error.message === "not_signed_in") return "로그인이 필요합니다"
  return "일정을 불러오지 못했습니다"
}
