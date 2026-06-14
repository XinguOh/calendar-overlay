// 메뉴바 Tray 아이콘 — 16×16 단색 자물쇠 글리프(template image, base64 PNG).
// esbuild 가 main 을 단일 CJS 로 번들하므로 외부 에셋 복사 없이 data URL 로 인라인한다.
// 색은 alpha 만 의미(macOS template image 가 메뉴바 명암에 자동 대응).
export const TRAY_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALElEQVR4nGNgGNbgPxomWTMxYoPcAGyYIs1EG0JVA/CJ0ceAgQkDfIZQHwAADHdBvwV6uwcAAAAASUVORK5CYII="
