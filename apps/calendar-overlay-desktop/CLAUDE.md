# calendar-overlay-desktop — Google Calendar macOS 오버레이 셸

화면 오른쪽 위에 떠 있는 반투명 오버레이로 "지금/다음 일정"을 조용히 보여주는 개인용 MVP 의 Electron 셸.
UI 는 `apps/calendar-overlay`(Next 렌더러)가, OS 셸·OAuth·Keychain·Google Calendar fetch 는 이 앱(main)이 담당한다.

## 구조

- `src/main/` — Electron main (Node). 윈도우·OAuth·토큰·Calendar 호출·OverlayState 조립.
  - `index.ts` 진입점(IPC 등록 + 창 생성 + 잠금 단축키/Tray + refresh 시작), `window.ts`(frameless·transparent·always-on-top + 위치/높이 저장·복원 `window.json{x,y,h}` + `applyClickThrough`/`resizeOverlay`), `auth.ts`(PKCE loopback), `token-store.ts`(safeStorage), `calendar.ts`(events fetch + 정규화), `overlay-state.ts`(상태 조립·broadcast), `refresh.ts`(주기/절전/네트워크 갱신), `tray-icon.ts`(메뉴바 자물쇠 아이콘 base64).
  - 잠금/해제는 `globalShortcut`(⇧⌘O)·**메뉴바 Tray 아이콘 좌클릭**(한 번에 토글)이 주 진입점. Tray 우클릭 = 옵션 메뉴(선택/잠그기·종료). Dock 은 숨김(`app.dock.hide()`).
  - **미니 데이뷰**: `@repo/calendar` `layoutDay` 가 하루 일정을 시간비례·중첩(depth) 레이아웃으로 만들고, renderer 가 px/시 배율로 절대 배치(now-line·시간 그리드·종일칩·캘린더 색 솔리드). 창 높이는 해제 상태에서 **하단 리사이즈 그립** 드래그로 조절 → `resizeTo` → `setBounds`(x/y/너비 유지)·영속, 내부 스크롤.
- `src/preload/index.ts` — `contextBridge` 로 좁은 `window.overlay` API 만 노출. **토큰 접근 메서드 없음.**
- `src/lib/env.ts` — `process.env` 단일 진입점(ESLint 예외 경로).
- 순수 도메인 로직(event 정규화·현재/다음 선택)과 공유 타입은 `@repo/calendar` 패키지에 있다(테스트도 거기).

## 보안

- `nodeIntegration:false · contextIsolation:true · sandbox:true · webSecurity:true`, 외부 새 창 차단.
- access/refresh token 은 renderer 로 절대 노출 안 함. 모든 Google API 호출은 main.
- refresh token 은 macOS Keychain 으로 보호된 `safeStorage` 로 암호화해 `userData/auth.enc` 에 저장.

## Google OAuth 설정 (최초 1회)

1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 생성 → **Google Calendar API** 활성화.
2. OAuth 동의 화면 구성(External, 테스트 사용자에 본인 이메일 추가).
3. 사용자 인증 정보 → OAuth client ID → **애플리케이션 유형 = "데스크톱 앱"** 으로 생성.
   - ⚠️ "웹 애플리케이션" 으로 만들면 loopback `127.0.0.1:<랜덤포트>` 가 거부된다. 반드시 "데스크톱 앱".
   - **client ID 는 필수.** client secret 은 PKCE 만으로 동작하면 비워두고, Google 이 토큰 교환에서 요구하면 채운다(둘 다 `.env.local` 지원).
4. 요청 scope(코드에 박혀 있음). `calendar.events` 는 읽기+쓰기를 모두 포함(편집 지원):
   - `https://www.googleapis.com/auth/calendar.events` (읽기+쓰기)
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
   - ⚠️ readonly 로 먼저 로그인했다면 토큰에 쓰기 권한이 없다 → 오버레이가 자동 감지해 재동의를 안내한다(로그아웃→재로그인). 데스크톱 앱은 incremental authorization 미지원이라 scope 확장은 전체 재동의로 처리.

## 실행 (macOS smoke)

1. **client ID/secret 을 `.env.local` 에 넣는다** (`apps/calendar-overlay-desktop/.env.local`, gitignore 됨):
   ```
   GOOGLE_CLIENT_ID=<your-id>.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=        # 선택 — Google 이 요구하면 채움
   ```
   `.env.local.example` 복사해서 채우면 된다. main 이 시작 시 자동 로드한다(Node 내장 `loadEnvFile`).
2. 레포 루트에서 실행:
   ```bash
   pnpm install      # 최초 1회 (electron 바이너리 포함)
   pnpm dev:overlay
   ```

- `dev:overlay` 가 Next 렌더러(:3010)를 띄우고, 준비되면 Electron 오버레이를 우상단에 띄운다.
- 오버레이의 **"Google 캘린더 연결"** 클릭 → 시스템 브라우저에서 동의 → 일정 표시.
- 평소엔 **완전 클릭 통과되는 패시브 HUD**(카드 위 클릭도 뒤 앱으로 통과). 오버레이를 선택(만지거나 옮기기)하려면 **메뉴바 Tray 아이콘 좌클릭 또는 ⇧⌘O** → 그 즉시 카드 상호작용+상시 드래그, 다시 같은 동작(또는 카드 "잠금" 버튼)으로 재잠금(재시작 후 위치·높이 복원).
- 표시는 **미니 데이뷰**(구글 캘린더풍): 시간비례 높이 블록 + 겹치는 일정 중첩(inset) + 캘린더 색 + now-line. 해제 상태에서 **카드 하단 그립을 세로로 드래그**해 창 높이를 조절(내부 스크롤, 높이 영속). 잠금 상태는 스크롤도 통과되므로 보려면 "선택"으로 해제.
- `.env.local` 대신 셸에서 `GOOGLE_CLIENT_ID=... pnpm dev:overlay` 로 넘겨도 된다(env var 우선).

## 빌드

- `pnpm --filter @apps/calendar-overlay-desktop build` — esbuild 가 `src/main`·`src/preload` 를 `dist/{main,preload}.js`(CJS)로 번들. `electron` 은 external(런타임 제공).
- `pnpm --filter @apps/calendar-overlay-desktop typecheck` — tsc `--noEmit` (빌드는 esbuild 전담).
- 배포 패키징(electron-builder·코드사이닝·auto-update)은 MVP 범위 밖.

## 지원 범위 (편집)

일반(단일·timed) 일정의 생성·제목 수정·시간 이동·삭제를 오버레이 카드에서 직접 한다(낙관적 업데이트 →
재갱신 버튼/5분 폴링으로 reconcile). 반복(recurring) 일정은 읽기전용. 모든 쓰기는 main 경유(쓰기 scope
`calendar.events`, readonly 토큰이면 자동 감지해 재동의 배너).

## MVP 범위 밖 (의도적 제외)

완료/숨김 토글, 반복 일정 편집, incremental syncToken(오늘 윈도우엔 무이득 — bounded full-fetch 유지),
Windows/Linux, 앱 패키징·서명·자동 업데이트.
