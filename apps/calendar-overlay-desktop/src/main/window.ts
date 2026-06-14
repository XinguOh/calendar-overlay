import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { app, BrowserWindow, screen } from "electron"

const WIDTH = 300
// 데이뷰 기본 높이(저장 높이 없을 때). 사용자가 하단 그립으로 조절하면 영속.
const DEFAULT_HEIGHT = 420
const MARGIN = 20
const MIN_HEIGHT = 140
// 투명도 하한 — 0 으로 사라져 못 찾는 사고 방지(설정 모드 슬라이더와 동일 하한).
const MIN_OPACITY = 0.35

type WindowState = { x: number; y: number; h: number; opacity?: number }

function statePath(): string {
  return join(app.getPath("userData"), "window.json")
}

function loadState(): Partial<WindowState> | null {
  try {
    const path = statePath()
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, "utf8")) as Partial<WindowState>
  } catch {
    // 손상된 파일 — 기본값으로
    return null
  }
}

// 이동/리사이즈가 연속으로 들어오므로 300ms 디바운스 — 드래그 중 매 프레임 디스크 쓰기 방지.
let persistTimer: ReturnType<typeof setTimeout> | null = null
function persist(win: BrowserWindow): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    const { x, y, height } = win.getBounds()
    // 기존 opacity 보존 — bounds 만 갱신하느라 사용자가 저장한 투명도를 떨구지 않게 머지.
    const prev = loadState()
    try {
      writeFileSync(statePath(), JSON.stringify({ x, y, h: height, opacity: prev?.opacity }))
    } catch {
      // 저장 실패는 무시 (다음 이동/리사이즈에서 재시도)
    }
  }, 300)
}

function defaultTopRight(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay()
  return { x: workArea.x + workArea.width - WIDTH - MARGIN, y: workArea.y + MARGIN }
}

// 저장 위치가 현재 디스플레이 안에 있는지 (모니터 분리/해상도 변경 후 화면 밖 복원 방지).
function isOnScreen(x: number, y: number): boolean {
  return screen.getAllDisplays().some((d) => {
    const b = d.bounds
    return x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height
  })
}

export function createOverlayWindow(preloadPath: string, url: string): BrowserWindow {
  const saved = loadState()
  const hasPos = saved && typeof saved.x === "number" && typeof saved.y === "number"
  const pos =
    hasPos && isOnScreen(saved.x!, saved.y!) ? { x: saved.x!, y: saved.y! } : defaultTopRight()
  // 저장 높이가 손상(0·음수·작은 값)이면 기본값 — 0 높이 창으로 안 보이는 사고 방지.
  const height = typeof saved?.h === "number" && saved.h >= MIN_HEIGHT ? saved.h : DEFAULT_HEIGHT

  const win = new BrowserWindow({
    width: WIDTH,
    height,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })

  // 전체화면 앱 위에도 떠 있게 + 모든 스페이스에 표시.
  win.setAlwaysOnTop(true, "screen-saver")
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // 외부 도메인 새 창 차단 (보안).
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  // 기본은 클릭 통과(뒤 앱으로). forward:true 라 renderer 가 hover 를 감지해 만질 때만 살린다.
  win.setIgnoreMouseEvents(true, { forward: true })

  // 드래그로 옮긴 위치 저장(x/y/h 전체, persist 가 디바운스).
  win.on("moved", () => persist(win))

  void win.loadURL(url)
  return win
}

/**
 * 클릭 통과 적용. passthrough=true 면 뒤 앱으로 통과(+forward 로 hover 추적), false 면 창이 마우스를 받는다.
 * main 이 `잠금 && !버튼hover` 로 계산해 넘긴다 — 잠금이어도 버튼 위에선 false 라 그 버튼만 클릭된다.
 */
export function applyClickThrough(win: BrowserWindow, passthrough: boolean): void {
  win.setIgnoreMouseEvents(passthrough, { forward: passthrough })
}

/** 사용자가 하단 그립으로 정한 높이로 창 높이만 조정 — x/y/너비 보존, 화면 안으로 clamp, 영속. */
export function resizeOverlay(win: BrowserWindow, height: number): void {
  const { x, y, width } = win.getBounds()
  const display = screen.getDisplayNearestPoint({ x, y })
  // max 가 MIN 보다 작아지는 짧은 디스플레이에서도 clamp 가 역전되지 않게 하한 보장.
  const max = Math.max(MIN_HEIGHT, display.workArea.height - MARGIN * 2)
  const clamped = Math.min(Math.max(Math.round(height), MIN_HEIGHT), max)
  win.setBounds({ x, y, width, height: clamped })
  persist(win)
}

/** 저장된 오버레이 투명도(0.35~1). 없거나 손상이면 1(불투명). renderer 가 마운트 시 복원. */
export function loadOpacity(): number {
  const v = loadState()?.opacity
  return typeof v === "number" && v >= MIN_OPACITY && v <= 1 ? v : 1
}

/** 오버레이 투명도 영속 — 기존 위치/높이(window.json)는 보존하고 opacity 만 갱신("저장" 시). */
export function saveOpacity(value: number): void {
  const clamped = Math.min(Math.max(value, MIN_OPACITY), 1)
  const prev = loadState()
  try {
    writeFileSync(statePath(), JSON.stringify({ ...prev, opacity: clamped }))
  } catch {
    // 저장 실패는 무시
  }
}
