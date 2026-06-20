// @repo/calendar 공개 계약. desktop(main, producer)·Next renderer(consumer) 가 공유한다.
// 이 타입들은 IPC 경계를 넘는 직렬화 가능한 값만 담는다 (Date·함수·클래스 금지 — 문자열 ISO·number).

/** Google Calendar `events.list` item 중 정규화에 필요한 필드만 추린 입력 형태. */
export type GoogleEventDateTime = {
  /** all-day: "2026-06-14" (YYYY-MM-DD). */
  date?: string
  /** timed: RFC3339 with offset, e.g. "2026-06-14T13:00:00+09:00". */
  dateTime?: string
  timeZone?: string
}

export type GoogleConferenceEntryPoint = {
  entryPointType?: string
  uri?: string
}

export type GoogleEvent = {
  id?: string
  status?: string
  summary?: string
  start?: GoogleEventDateTime
  end?: GoogleEventDateTime
  colorId?: string
  hangoutLink?: string
  location?: string
  description?: string
  conferenceData?: { entryPoints?: GoogleConferenceEntryPoint[] }
  /** 반복 일정 인스턴스면 부모 시리즈 id (singleEvents=true 전개 시 채워짐). 단일 일정엔 없음. */
  recurringEventId?: string
}

/** main 이 calendar 별로 fetch 한 raw event 를 calendar 메타와 함께 normalize 에 넘기는 단위. */
export type RawCalendarEvent = {
  event: GoogleEvent
  calendarId: string
  /** 그 캘린더의 backgroundColor (없으면 null). event.colorId 가 우선. */
  calendarColorHex: string | null
}

/** IPC 로 renderer 에 전달되는 정규화된 일정 1건. */
export type NormalizedEvent = {
  id: string
  title: string
  /** ISO 문자열. timed=offset 포함 RFC3339, all-day=`${date}T00:00:00` (로컬 자정). */
  start: string
  end: string
  allDay: boolean
  calendarId: string
  colorHex: string | null
  meetingUrl: string | null
  /** 반복 일정 인스턴스면 true → renderer 는 편집(수정·이동·삭제) 비활성, 읽기전용. */
  recurring: boolean
}

/** 새 일정 생성 입력(IPC). timed 일정만 — start/end 는 offset 포함 RFC3339 ISO 문자열. */
export type EventDraft = {
  calendarId: string
  title: string
  start: string
  end: string
}

/** 일정 부분 수정 입력(IPC). 보낸 필드만 변경. 제목 수정·시간 이동 공용. */
export type EventPatch = {
  id: string
  calendarId: string
  title?: string
  start?: string
  end?: string
}

/** 쓰기 결과 — 성공/실패와 실패 사유(renderer 가 롤백·안내 분기). 토큰·민감정보 미포함.
 *  recurring-readonly: 반복 일정은 renderer 가 편집 핸들러 자체를 안 붙여 IPC 에 도달하지 않으므로
 *  실제로는 main 이 생산하지 않는 예약 사유(향후 main 측 방어를 넣을 때 대비). */
export type WriteResult =
  | { ok: true }
  | { ok: false; reason: "insufficient-scope" | "recurring-readonly" | "network" | "unknown" }

/** "지금" 상태 — 진행 중 일정이 있으면 in-event, 없으면 free(+다음 일정까지 남은 시간). */
export type ReadyNow =
  | { kind: "in-event"; event: NormalizedEvent; remainingMs: number }
  | { kind: "free"; next: { event: NormalizedEvent; startsInMs: number } | null }

/** selectOverlay 결과 — "지금" + 다음 1~2개. */
export type OverlaySelection = {
  now: ReadyNow
  /** 시작이 now 이후인 timed 일정, 가까운 순 최대 2개. */
  upcoming: NormalizedEvent[]
}

/** 데이뷰 타임라인 블록 1건 — 절대 위치(분 단위) + 중첩 깊이. */
export type DayBlock = {
  event: NormalizedEvent
  /** range 시작(startTs)으로부터 분. */
  topMin: number
  /** 일정 길이(분, 최소 1). */
  durationMin: number
  /** 포함(겹침) 중첩 깊이 — 0 최상위, 1+ 다른 일정 안에 든 것. */
  depth: number
}

/** 하루 타임라인 레이아웃 — renderer 가 px/시 배율을 곱해 절대 배치. */
export type DayLayout = {
  /** range 시작(시 단위 내림) epoch ms — now-line·시간 라벨 기준. */
  startTs: number
  /** range 전체 길이(분) = 끝 - 시작. */
  totalMin: number
  /** timed 일정 블록(시작순). */
  blocks: DayBlock[]
  /** 종일 일정 — 타임라인 밖 칩으로 표시. */
  allDay: NormalizedEvent[]
}

/** renderer 가 받는 전체 오버레이 상태. locked 는 모든 상태에 공통(잠금 표시등용).
 *  locked=true 면 완전 클릭 통과(패시브 HUD), false 면 카드 상호작용+드래그. */
export type OverlayState =
  | { status: "unauthenticated"; locked: boolean }
  | { status: "loading"; locked: boolean }
  | { status: "error"; message: string; locked: boolean }
  | {
      status: "ready"
      locked: boolean
      lastSyncedAt: string
      /** 상단 상태 칩용("지금"/"비어 있음"). */
      now: ReadyNow
      /** 하루 타임라인(데이뷰). */
      day: DayLayout
      /** 쓰기 권한 보유 — 편집 UI 게이팅·재동의 배너. broadcast 마다 최신 auth 동승(토큰 미포함). */
      canWrite: boolean
      /** primary 캘린더 id(=계정 이메일) — 새 일정 생성 대상. fetch 후 채워짐, 없으면 null. */
      email: string | null
    }

/** 로그인 상태 — renderer 에 노출 가능한 최소 정보(토큰 절대 미포함).
 *  canWrite: 저장된 granted scope 에 쓰기 권한(calendar.events)이 있는지 — 편집·재동의 배너 트리거. */
export type AuthStatus = { signedIn: boolean; email: string | null; canWrite: boolean }

/**
 * preload(contextBridge) 가 renderer 에 노출하는 좁은 API 계약.
 * desktop preload(producer)·Next renderer(consumer) 가 이 타입 하나를 공유한다.
 * 토큰 접근 메서드는 의도적으로 없다 — 모든 Google API 호출은 main 프로세스가 한다.
 */
export interface OverlayBridge {
  getAuthStatus(): Promise<AuthStatus>
  signIn(): Promise<AuthStatus>
  signOut(): Promise<AuthStatus>
  getOverlayState(): Promise<OverlayState>
  /** 상태 변경 구독. 반환값은 구독 해제 함수. */
  onOverlayStateChanged(callback: (state: OverlayState) => void): () => void
  /** 잠금 상태만 변경 구독 — 편집 중 낙관적 day 를 덮지 않도록 full state 대신 locked 만 머지. 반환=해제 함수. */
  onLockChanged(callback: (locked: boolean) => void): () => void
  /**
   * 잠금/해제 토글. 해제(locked=false) 시 카드 상호작용+상시 드래그, 잠금 시 완전 클릭 통과.
   * 진입점: globalShortcut·Tray(main) + 카드 내 컨트롤 버튼.
   */
  toggleLock(): Promise<void>
  /**
   * 잠금 상태에서 카드 컨트롤 버튼 위 hover 여부. true 면 그 버튼 영역만 클릭 통과를 끈다
   * — 나머지 카드는 통과시키되 버튼 하나만 눌러 잠금 해제할 수 있게 한다.
   */
  setControlHover(hovered: boolean): void
  /** 하단 리사이즈 그립 드래그로 정한 창 높이(px) — x/y/너비 유지, main 이 영속한다. */
  resizeTo(height: number): void
  /**
   * 헤더 드래그 시작 — main 이 현재 창 위치를 기준점으로 캡처한다.
   * 창 이동은 CSS -webkit-app-region 대신 JS pointer + setPosition 으로 구현(macOS 투명·frameless 창에서 app-region 불안정 회피).
   */
  dragStart(): void
  /** 드래그 시작 시점 대비 스크린 이동량(px) — main 이 기준점+이동량으로 setPosition. 영속은 main 의 moved 핸들러가 처리. */
  dragMove(dx: number, dy: number): void
  /** 드래그 종료 — main 의 기준점 해제. */
  dragEnd(): void
  /** 저장된 오버레이 투명도(0.35~1) 읽기 — renderer 가 마운트 시 복원. main(window.json)이 SSOT, 시각 적용은 renderer CSS. */
  getOpacity(): Promise<number>
  /** 오버레이 투명도 영속("저장" 클릭 시) — main 이 window.json 에 기록. 토큰·민감정보 무관. */
  saveOpacity(value: number): void
  /**
   * 일정 쓰기 — renderer 는 의도(payload)만 보내고 main 이 Google API 를 호출한다.
   * 토큰은 절대 건너오지 않는다. 편집 후 자동 갱신은 하지 않음 — 낙관적 업데이트로 로컬 반영하고,
   * 서버 정답 동기화·외부 변경 반영은 refreshNow()(재갱신 버튼) 또는 main 의 5분 폴링이 한다.
   */
  createEvent(draft: EventDraft): Promise<WriteResult>
  /** 제목/내용 수정(events.patch). */
  updateEvent(patch: EventPatch): Promise<WriteResult>
  /** 시간 이동(events.patch start/end). events.move 가 아님 — 같은 캘린더 안 시각 변경. */
  moveEvent(patch: EventPatch): Promise<WriteResult>
  deleteEvent(id: string, calendarId: string): Promise<WriteResult>
  /** 재갱신 버튼 — 최신 일정을 수동으로 fetch 해 broadcast 한다(외부 변경·편집 reconcile). */
  refreshNow(): Promise<void>
}
