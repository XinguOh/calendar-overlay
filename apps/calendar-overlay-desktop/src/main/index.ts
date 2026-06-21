import { join, sep } from "node:path"
import { pathToFileURL } from "node:url"

import {
  app,
  type BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  Tray,
} from "electron"

import type { EventDraft, EventPatch } from "@repo/calendar"

import { env } from "../lib/env"

import { getAuthStatus, signIn, signOut } from "./auth"
import { createEvent, deleteEvent, patchEvent } from "./calendar"
import { getState, refreshState, setLocked } from "./overlay-state"
import { startRefreshLoop, triggerRefresh } from "./refresh"
import { TRAY_ICON } from "./tray-icon"
import {
  applyClickThrough,
  createOverlayWindow,
  loadOpacity,
  resizeOverlay,
  saveOpacity,
} from "./window"

// 패키지 빌드에서 렌더러 정적 export(out/)를 app:// 로 서빙하기 위해 스킴을 특권 등록(ready 전).
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

// 기본 잠금(완전 클릭 통과 패시브 HUD). 해제 시에만 카드 상호작용+상시 드래그.
let locked = true
// 잠금 상태에서 카드 컨트롤 버튼 위 hover 여부 — 그 버튼만 통과를 끈다.
let controlHover = false
let overlayWin: BrowserWindow | null = null
let tray: Tray | null = null
// 헤더 JS 드래그(=CSS app-region 대체)의 기준점 — 드래그 시작 시점의 창 좌상단(x,y). 드래그 중에만 non-null.
let dragOrigin: { x: number; y: number } | null = null

/** 통과 = 잠금 && !버튼hover. 잠금이어도 버튼 위에선 통과 OFF 라 그 버튼만 클릭된다. */
function applyMouse(): void {
  if (overlayWin) applyClickThrough(overlayWin, locked && !controlHover)
}

/** 잠금/해제 단일 진입 — 창 적용 + 상태 broadcast + Tray 툴팁 갱신. */
function toggleLock(): void {
  locked = !locked
  // 버튼 위에서 토글(단축키/Tray)해도 hover 가 stuck 으로 남아 잠금 HUD 가 클릭을 먹지 않게 리셋.
  controlHover = false
  applyMouse()
  setLocked(locked)
  updateTrayTooltip()
}

function updateTrayTooltip(): void {
  tray?.setToolTip(
    locked ? "캘린더 오버레이 (클릭하면 선택 가능)" : "캘린더 오버레이 (선택 중 — 클릭하면 잠금)",
  )
}

function createTray(): void {
  const icon = nativeImage.createFromDataURL(TRAY_ICON)
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  updateTrayTooltip()
  // 아이콘 좌클릭 = 그 즉시 잠금/해제 토글(메뉴 없이 한 번에 오버레이 선택). 우클릭 = 옵션 메뉴.
  tray.on("click", toggleLock)
  tray.on("right-click", () => {
    tray?.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: locked ? "오버레이 선택 (⇧⌘O)" : "잠그기 (⇧⌘O)", click: toggleLock },
        { type: "separator" },
        { label: "종료", click: () => app.quit() },
      ]),
    )
  })
}

function registerIpc(): void {
  ipcMain.handle("auth:status", () => getAuthStatus())
  ipcMain.handle("auth:signIn", async () => {
    const status = await signIn()
    triggerRefresh()
    return status
  })
  ipcMain.handle("auth:signOut", async () => {
    const status = signOut()
    await refreshState()
    return status
  })
  ipcMain.handle("overlay:get", () => getState())
  // 카드 내 컨트롤 버튼 클릭 — globalShortcut·Tray 와 동일 토글.
  ipcMain.handle("overlay:toggleLock", () => toggleLock())
  // 잠금 상태에서 컨트롤 버튼 hover — 그 버튼 영역만 클릭 통과를 끈다.
  ipcMain.on("overlay:controlHover", (_event, hovered: boolean) => {
    controlHover = hovered
    applyMouse()
  })
  // renderer 가 측정한 콘텐츠 높이로 창 높이만 조정(x/y/너비 유지).
  ipcMain.on("overlay:resize", (_event, height: number) => {
    if (overlayWin) resizeOverlay(overlayWin, height)
  })
  // 투명도 — renderer 가 라이브 값을 소유(CSS), main 은 영속만: 복원(read) + "저장" 시 기록(write).
  ipcMain.handle("overlay:getOpacity", () => loadOpacity())
  ipcMain.on("overlay:saveOpacity", (_event, value: number) => saveOpacity(value))
  ipcMain.on("overlay:online", () => triggerRefresh())

  // 헤더 드래그 이동 — CSS -webkit-app-region 대신 JS 로 구현(macOS 투명·frameless 창에서 app-region 이
  // 자손 비전파+불안정해 패키지 빌드에서 가운데가 안 잡혔다). renderer 가 스크린 이동량(dx,dy)을 보내면
  // 시작 시점 창 위치+이동량으로 절대 setPosition — 프레임 누락이 오차로 누적되지 않는다.
  ipcMain.on("overlay:dragStart", () => {
    if (overlayWin) {
      const { x, y } = overlayWin.getBounds()
      dragOrigin = { x, y }
    }
  })
  ipcMain.on("overlay:dragMove", (_event, d: { dx: number; dy: number }) => {
    if (overlayWin && dragOrigin) {
      overlayWin.setPosition(Math.round(dragOrigin.x + d.dx), Math.round(dragOrigin.y + d.dy))
    }
  })
  // 위치 영속은 별도 코드 불필요 — setPosition 이 moved 이벤트를 발생시켜 window.ts 의 persist 가 저장한다.
  ipcMain.on("overlay:dragEnd", () => {
    dragOrigin = null
  })

  // 일정 쓰기 — renderer 는 의도(payload)만 보내고 main 이 Google API 호출. 토큰은 건너오지 않는다.
  // 편집 후 자동 갱신하지 않는다(사용자 결정) — renderer 가 낙관적 업데이트로 로컬 반영하고,
  // 서버 정답 동기화는 overlay:refresh(재갱신 버튼) 또는 5분 폴링이 한다.
  ipcMain.handle("calendar:create", (_event, draft: EventDraft) => createEvent(draft))
  ipcMain.handle("calendar:update", (_event, patch: EventPatch) => patchEvent(patch))
  ipcMain.handle("calendar:move", (_event, patch: EventPatch) => patchEvent(patch))
  ipcMain.handle("calendar:delete", (_event, id: string, calendarId: string) =>
    deleteEvent(id, calendarId),
  )
  // 재갱신 버튼 — 수동으로 최신 일정 fetch + broadcast. await 가능하게 refreshState 직접 반환
  // (버튼이 갱신 완료 시점까지 pending 상태를 표시할 수 있게).
  ipcMain.handle("overlay:refresh", () => refreshState())
  // 카드 헤더 "끄기" 버튼 — Tray 우클릭 "종료"와 동일.
  ipcMain.on("app:quit", () => app.quit())
}

/** 렌더러 로드 URL — dev 는 Next 서버(env.overlayUrl=localhost), 패키지 빌드는 번들된 정적 export(out/)를
 *  app:// 커스텀 프로토콜로 서빙. file:// 는 Next 절대 자산경로(/_next)를 못 풀어 깨지므로 우회. */
function resolveRendererUrl(): string {
  if (!app.isPackaged) return env.overlayUrl
  const rendererDir = join(process.resourcesPath, "renderer")
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url)
    const rel = decodeURIComponent(pathname === "/" ? "/index.html" : pathname)
    const filePath = join(rendererDir, rel)
    // 번들 디렉터리 밖 접근 차단(path traversal).
    if (filePath !== rendererDir && !filePath.startsWith(rendererDir + sep)) {
      return new Response("forbidden", { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
  return "app://bundle/index.html"
}

void app.whenReady().then(() => {
  registerIpc()
  overlayWin = createOverlayWindow(join(__dirname, "preload.js"), resolveRendererUrl())
  globalShortcut.register("CommandOrControl+Shift+O", toggleLock)
  createTray()
  // 순수 메뉴바/HUD 앱 — Dock 숨김. 종료는 Tray "종료" 로.
  app.dock?.hide()
  startRefreshLoop()
})

app.on("will-quit", () => globalShortcut.unregisterAll())

// 단일 오버레이 창 — 닫으면 종료.
app.on("window-all-closed", () => app.quit())
