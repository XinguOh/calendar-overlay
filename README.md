# Calendar Overlay

화면 우상단에 조용히 떠 있는 **Google 캘린더 오버레이** (macOS). 지금/다음 일정을 구글 캘린더풍 미니 데이뷰로 보여주고, 평소엔 완전히 클릭 통과되는 패시브 HUD 로 동작한다.

> A quiet, always-on-top macOS overlay for your Google Calendar — now & next, at a glance.

## 특징

- **패시브 HUD** — 평소엔 클릭이 뒤 앱으로 통과. 메뉴바 자물쇠 아이콘 / `⇧⌘O` 로 "선택" 모드 전환.
- **미니 데이뷰** — 시간비례 블록 · 겹치는 일정 중첩 · 캘린더 색 · now-line.
- **편집** — 단일 일정 생성 · 제목/시간 수정 · 드래그로 시간 이동 · `×` 빠른 삭제 (반복 일정은 잠금/읽기전용).
- **투명도 조절** — 설정 모드에서 슬라이더로 오버레이 전체 투명도 조절, 저장 시 영속.
- **로컬 우선 보안** — access/refresh 토큰은 renderer 에 절대 노출 안 함. 모든 Google API 호출은 Electron main. refresh 토큰은 macOS Keychain(`safeStorage`)으로 암호화 저장.

## 설치 (받아서 쓰기)

> **Apple Silicon(M1 이상) Mac 전용**, 서명되지 않은 빌드입니다.

1. [Releases](https://github.com/XinguOh/calendar-overlay/releases) 에서 최신 `Calendar Overlay-*-arm64-mac.zip` 다운로드 → 더블클릭 압축 해제.
2. `Calendar Overlay.app` 을 **응용 프로그램** 폴더로 드래그.
3. 서명이 없어 처음엔 Gatekeeper 가 막습니다. 터미널에서 한 줄:
   ```bash
   xattr -cr "/Applications/Calendar Overlay.app"
   ```
   (또는 앱 우클릭 → 열기)
4. 실행 → 메뉴바 자물쇠 아이콘 클릭(또는 `⇧⌘O`)으로 선택 → **"Google 캘린더 연결"**.
5. 구글 동의 화면에서 **"고급" → "Calendar Overlay(으)로 이동"** → 로그인. (앱이 Google 확인 심사를 받지 않아 뜨는 경고 — 직접 만든 앱이라 안전합니다.)

## 소스에서 빌드

직접 빌드하려면 **본인 Google OAuth client ID** 가 필요합니다.

1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 → **Google Calendar API** 활성화 → OAuth 동의 화면 구성 → 사용자 인증 정보에서 **"데스크톱 앱"** 유형 OAuth client ID 생성. (⚠️ "웹 애플리케이션"으로 만들면 loopback 이 거부됨.)
2. client ID 를 환경 파일에 넣기:
   ```bash
   cp apps/calendar-overlay-desktop/.env.local.example apps/calendar-overlay-desktop/.env.local
   # .env.local 의 GOOGLE_CLIENT_ID 채우기
   ```
3. 빌드:
   ```bash
   pnpm install
   pnpm dev       # 개발 실행 (Next renderer + Electron)
   pnpm package   # 배포용 .app/zip → apps/calendar-overlay-desktop/release/
   ```

> Releases 의 사전 빌드본은 메인테이너의 client ID 가 박혀 있어 최대 100명까지 바로 쓸 수 있습니다(미확인 앱 한도). 더 많은 사용자/경고 제거가 필요하면 본인 client ID 로 빌드하거나 Google 확인 심사를 받으세요.

## 구조

pnpm 워크스페이스 · 3개 멤버:

- `apps/calendar-overlay` — Next.js 렌더러(UI). 정적 export(`output: export`, `EXPORT=1`)로 빌드돼 Electron 이 `app://` 커스텀 프로토콜로 로드.
- `apps/calendar-overlay-desktop` — Electron 셸(main + preload). 투명·항상위 창, OAuth(PKCE loopback), 토큰(Keychain), Google Calendar fetch, IPC.
- `packages/calendar` (`@repo/calendar`) — IPC 계약 타입 + 순수 로직(normalize · layoutDay) + 테스트.

UI 와 셸은 `window.overlay` IPC(좁은 contextBridge API)로만 통신하며, 토큰 접근 메서드는 없다.

## 한계 / 알아둘 것

- **Apple Silicon · 비서명** — Intel Mac 미지원(별도 빌드 필요), 첫 실행 Gatekeeper 우회 필요.
- 반복(recurring) 일정 편집은 미지원(읽기전용). 일정 인스턴스/시리즈 분기 미구현.
- Windows/Linux, 앱 서명·공증·자동 업데이트는 범위 밖.

## 라이선스

[MIT](./LICENSE)
