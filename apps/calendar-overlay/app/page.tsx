"use client"

import { useEffect, useRef, useState } from "react"
import type { ComponentProps, CSSProperties, PointerEvent as ReactPointerEvent } from "react"

import type {
  DayLayout,
  NormalizedEvent,
  OverlayState,
  ReadyNow,
  WriteResult,
} from "@repo/calendar"
import { layoutDay } from "@repo/calendar"

const PX_PER_MIN = 52 / 60 // 시간당 52px
const GUTTER = 30 // 좌측 시각 라벨 폭
const INSET = 12 // 중첩 깊이당 들여쓰기
const MIN_BLOCK = 18 // 블록 최소 높이
const DRAG_THRESHOLD = 4 // 이 px 넘게 움직이면 클릭이 아니라 시간 이동 드래그로 본다
const SNAP_MIN = 5 // 드래그 시간 이동 스냅 단위(분)

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

// 시각 포맷은 hydration-safe 하게 직접 합성 (raw toLocale* 는 ESLint 금지 — getHours/getMinutes 사용).
function clock(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours()}:${pad2(d.getMinutes())}`
}

// <input type="time"> 의 value("HH:MM", 24h) 형태.
function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// 기존 일정의 날짜는 유지하고 시각(HH:MM)만 교체 → 로컬 시각 기준 ISO(UTC) 로 직렬화.
// 렌더러는 사용자 머신(=사용자 타임존)에서 도므로 로컬 Date 연산이 정확하고, Google 은 UTC instant 로 저장한다.
function withTime(baseIso: string, time: string): string {
  const d = new Date(baseIso)
  const [h, m] = time.split(":")
  d.setHours(Number(h), Number(m), 0, 0)
  return d.toISOString()
}

function shiftIso(iso: string, deltaMin: number): string {
  return new Date(new Date(iso).getTime() + deltaMin * 60000).toISOString()
}

function dur(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000))
  if (totalMin < 60) return `${totalMin}분`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}

// 캘린더 색이 밝은 파스텔이면 흰 글자가 안 보이므로 어두운 글자로 전환(밝기 추정).
function isLightHex(hex: string | null): boolean {
  if (!hex) return false
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m?.[1]) return false
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62
}

function nowChip(now: ReadyNow): string {
  if (now.kind === "in-event") return `진행 중 · ${dur(now.remainingMs)} 남음`
  return now.next ? `다음 ${dur(now.next.startsInMs)} 후` : "남은 일정 없음"
}

function writeFailureMessage(reason: Exclude<WriteResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "insufficient-scope":
      return "편집 권한이 없어요. 권한을 다시 동의해 주세요."
    case "recurring-readonly":
      return "반복 일정은 편집할 수 없어요."
    case "network":
      return "네트워크 오류로 적용하지 못했어요."
    default:
      return "적용하지 못했어요."
  }
}

// 오버레이 전용 native button 래퍼 — 디자인 시스템(@repo/ui) 미사용 개인용 MVP 라 단일 격리 지점에 둔다.
function OvButton(props: ComponentProps<"button">) {
  // eslint-disable-next-line no-restricted-syntax -- 오버레이 전용 native button (위 사유), 이 한 곳에 격리
  return <button type="button" {...props} />
}

/** 편집/생성 시트 — 카드 위를 덮는 작은 패널. 내부에 입력 로컬 상태를 둔다. */
function EditSheet({
  mode,
  initialTitle,
  initialStart,
  initialEnd,
  onSave,
  onDelete,
  onCancel,
}: {
  mode: "create" | "edit"
  initialTitle: string
  initialStart: string
  initialEnd: string
  onSave: (title: string, start: string, end: string) => void
  onDelete?: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initialTitle)
  const [startTime, setStartTime] = useState(hhmm(initialStart))
  const [endTime, setEndTime] = useState(hhmm(initialEnd))

  function save() {
    const start = withTime(initialStart, startTime)
    let end = withTime(initialEnd, endTime)
    // 끝이 시작보다 같거나 이르면 30분짜리로 보정(역전 방지).
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      end = new Date(new Date(start).getTime() + 30 * 60000).toISOString()
    }
    onSave(title.trim() || "(제목 없음)", start, end)
  }

  return (
    <div className="edit-sheet">
      <div className="edit-sheet-title">{mode === "create" ? "새 일정" : "일정 편집"}</div>
      <div className="edit-field">
        <span className="edit-label">제목</span>
        <input
          className="edit-input"
          aria-label="일정 제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          autoFocus
        />
      </div>
      <div className="edit-times">
        <div className="edit-field">
          <span className="edit-label">시작</span>
          <input
            className="edit-input"
            type="time"
            aria-label="시작 시각"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="edit-field">
          <span className="edit-label">종료</span>
          <input
            className="edit-input"
            type="time"
            aria-label="종료 시각"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>
      <div className="edit-actions">
        {onDelete ? (
          <OvButton className="sheet-btn danger" onClick={onDelete}>
            삭제
          </OvButton>
        ) : null}
        <span className="spacer" />
        <OvButton className="sheet-btn" onClick={onCancel}>
          취소
        </OvButton>
        <OvButton className="sheet-btn primary" onClick={save}>
          저장
        </OvButton>
      </div>
    </div>
  )
}

function DayTimeline({
  day,
  canEdit,
  onTap,
  onMove,
  onDelete,
}: {
  day: DayLayout
  canEdit: boolean
  onTap: (event: NormalizedEvent) => void
  onMove: (event: NormalizedEvent, newStart: string, newEnd: string) => void
  onDelete: (event: NormalizedEvent) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const didScroll = useRef(false)
  const [nowTs, setNowTs] = useState<number>(() => Date.now())
  const [drag, setDrag] = useState<{ id: string; offset: number } | null>(null)

  // now-line 은 1분마다 갱신(상태 broadcast 와 무관하게 renderer 로컬 시계).
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  // 최초 1회만 now 가 ~1/3 지점에 오도록 스크롤 — 이후 백그라운드 새로고침이
  // 사용자가 스크롤한 위치를 now 로 되튕기지 않게 한다.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || didScroll.current) return
    didScroll.current = true
    const m = (Date.now() - day.startTs) / 60000
    el.scrollTop = Math.max(0, m * PX_PER_MIN - el.clientHeight * 0.35)
  }, [day.startTs])

  // 편집 가능 블록의 포인터 제스처 — 임계값 미만이면 클릭(편집 시트), 넘으면 세로 드래그(시간 이동).
  function onBlockDown(e: ReactPointerEvent<HTMLDivElement>, event: NormalizedEvent) {
    e.stopPropagation()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const startScreenY = e.screenY
    let moved = false
    let deltaMin = 0
    const onPointerMove = (ev: PointerEvent) => {
      const dy = ev.screenY - startScreenY
      if (Math.abs(dy) > DRAG_THRESHOLD) moved = true
      deltaMin = Math.round(dy / PX_PER_MIN / SNAP_MIN) * SNAP_MIN
      setDrag({ id: event.id, offset: deltaMin * PX_PER_MIN })
    }
    const onPointerUp = () => {
      el.removeEventListener("pointermove", onPointerMove)
      el.removeEventListener("pointerup", onPointerUp)
      el.removeEventListener("pointercancel", onPointerUp)
      setDrag(null)
      if (!moved) {
        onTap(event)
        return
      }
      if (deltaMin !== 0)
        onMove(event, shiftIso(event.start, deltaMin), shiftIso(event.end, deltaMin))
    }
    el.addEventListener("pointermove", onPointerMove)
    el.addEventListener("pointerup", onPointerUp)
    el.addEventListener("pointercancel", onPointerUp)
  }

  const height = day.totalMin * PX_PER_MIN
  const nowMin = (nowTs - day.startTs) / 60000
  const nowVisible = nowMin >= 0 && nowMin <= day.totalMin

  const marks: { top: number; label: string }[] = []
  for (let m = 0; m <= day.totalMin; m += 60) {
    marks.push({ top: m * PX_PER_MIN, label: String(new Date(day.startTs + m * 60000).getHours()) })
  }

  return (
    <div className="day-scroll" ref={scrollRef}>
      <div className="day-timeline" style={{ height }}>
        {marks.map((mk) => (
          <div key={mk.top} className="hour-row" style={{ top: mk.top }}>
            <span className="hour-label">{mk.label}</span>
          </div>
        ))}
        {day.blocks.map((b) => {
          const h = Math.max(MIN_BLOCK, b.durationMin * PX_PER_MIN)
          // 단일·timed 일정만 편집 — 반복(recurring) 인스턴스는 읽기전용(잠금 표시 + no-drag).
          const editable = canEdit && !b.event.recurring
          // 반복 인스턴스 = 읽기전용. canEdit(잠금해제+쓰기권한)일 때만 — 단일이 편집 가능한 그 맥락에서만 잠금 대비를 보인다.
          const locked = canEdit && b.event.recurring
          const dragging = drag?.id === b.event.id
          const style = {
            top: b.topMin * PX_PER_MIN + (dragging ? drag.offset : 0),
            height: h,
            // 중첩은 구글처럼 양쪽으로 들여써 부모 위에 카드처럼 떠 보이게.
            left: GUTTER + b.depth * INSET,
            right: 6 + b.depth * INSET,
            zIndex: b.depth + 1,
            // 캘린더 색은 변수 참조 → inline 색 리터럴 금지 룰 대상 아님. CSS 가 솔리드 채움.
            "--block-accent": b.event.colorHex ?? undefined,
          } as CSSProperties
          const cls = ["day-block"]
          if (h < 30) cls.push("tight")
          if (b.depth > 0) cls.push("nested")
          if (isLightHex(b.event.colorHex)) cls.push("on-light")
          if (editable) cls.push("editable")
          if (locked) cls.push("locked")
          if (dragging) cls.push("dragging")
          return (
            <div
              key={b.event.id}
              className={cls.join(" ")}
              style={style}
              onPointerDown={
                editable
                  ? (e) => onBlockDown(e, b.event)
                  : locked
                    ? () => onTap(b.event) // press 시 안내(아래 onTap 분기). onClick 은 jsx-a11y 가 막음.
                    : undefined
              }
            >
              {editable ? (
                <OvButton
                  className="block-delete"
                  aria-label="삭제"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onDelete(b.event)}
                >
                  ×
                </OvButton>
              ) : null}
              <div className="day-block-title">
                {locked ? <span className="lock-badge">🔒</span> : null}
                {b.event.title}
                {b.event.meetingUrl ? <span className="meet-dot">●</span> : null}
              </div>
              {h >= 30 ? (
                <div className="day-block-time">{`${clock(b.event.start)}–${clock(b.event.end)}`}</div>
              ) : null}
            </div>
          )
        })}
        {nowVisible ? <div className="now-line" style={{ top: nowMin * PX_PER_MIN }} /> : null}
      </div>
    </div>
  )
}

function Body({
  state,
  canEdit,
  onTap,
  onMove,
  onDelete,
}: {
  state: OverlayState
  canEdit: boolean
  onTap: (event: NormalizedEvent) => void
  onMove: (event: NormalizedEvent, newStart: string, newEnd: string) => void
  onDelete: (event: NormalizedEvent) => void
}) {
  if (state.status === "loading") return <div className="message">불러오는 중…</div>
  if (state.status === "error") return <div className="message">{state.message}</div>
  if (state.status === "unauthenticated") {
    return (
      <OvButton className="signin-btn" onClick={() => void window.overlay?.signIn()}>
        Google 캘린더 연결
      </OvButton>
    )
  }
  return (
    <>
      {state.day.allDay.length > 0 ? (
        <div className="allday-row">
          {state.day.allDay.map((e) => (
            <span
              key={e.id}
              className="allday-chip"
              style={{ "--block-accent": e.colorHex ?? undefined } as CSSProperties}
            >
              {e.title}
            </span>
          ))}
        </div>
      ) : null}
      <DayTimeline
        day={state.day}
        canEdit={canEdit}
        onTap={onTap}
        onMove={onMove}
        onDelete={onDelete}
      />
    </>
  )
}

function startResize(e: ReactPointerEvent<HTMLDivElement>) {
  e.preventDefault()
  // 포인터 캡처 — 그립 밖/창 밖으로 빠르게 끌어도 move/up 이 이 요소로 보장 전달(리스너 누수·멈춤 방지).
  const grip = e.currentTarget
  grip.setPointerCapture(e.pointerId)
  const startScreenY = e.screenY
  const startH = window.innerHeight
  let raf = 0
  const onMove = (ev: PointerEvent) => {
    const y = ev.screenY
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => window.overlay?.resizeTo(startH + (y - startScreenY)))
  }
  const onUp = () => {
    cancelAnimationFrame(raf)
    grip.removeEventListener("pointermove", onMove)
    grip.removeEventListener("pointerup", onUp)
    grip.removeEventListener("pointercancel", onUp)
  }
  grip.addEventListener("pointermove", onMove)
  grip.addEventListener("pointerup", onUp)
  grip.addEventListener("pointercancel", onUp)
}

// 새 일정 기본 시각 — 다음 30분 경계 ~ +1시간.
function defaultDraft(): { start: string; end: string } {
  const d = new Date()
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  const start = d.toISOString()
  const end = new Date(d.getTime() + 60 * 60000).toISOString()
  return { start, end }
}

type EditTarget = { mode: "create" } | { mode: "edit"; event: NormalizedEvent }

export default function OverlayPage() {
  const [state, setState] = useState<OverlayState>({ status: "loading", locked: true })
  // 쓰기 권한·primary 캘린더는 broadcast 되는 OverlayState(ready) 에서 파생 — pull-only 면 최초 로그인/재동의 직후 stale.
  const canWrite = state.status === "ready" ? state.canWrite : false
  const primaryCalendarId = state.status === "ready" ? state.email : null
  // 저장 scope 가 stale 해 쓰기 시 403 이 난 경우의 로컬 override(배너 강제 노출). 재동의로 해제.
  const [scopeRejected, setScopeRejected] = useState(false)
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // 오버레이 전체 투명도(설정 모드 슬라이더). 0.35~1, '저장' 시 localStorage 영속.
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    const bridge = window.overlay
    if (!bridge) {
      // 일반 브라우저에서 열림 (웹 폴백). effect 본문 동기 setState 회피 위해 미룬다.
      const t = setTimeout(() => setState({ status: "unauthenticated", locked: true }), 0)
      return () => clearTimeout(t)
    }
    bridge
      .getOverlayState()
      .then(setState)
      .catch(() => {})
    return bridge.onOverlayStateChanged(setState)
  }, [])

  // 피드백은 잠시 뒤 자동 사라짐.
  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 4000)
    return () => clearTimeout(t)
  }, [feedback])

  // 저장된 투명도 복원 — main(window.json) 이 SSOT. 마운트 1회, async(.then) 라 effect-내-setState 룰 안전.
  useEffect(() => {
    const bridge = window.overlay
    if (!bridge) return
    void bridge.getOpacity().then((v) => {
      if (v >= 0.35 && v <= 1) setOpacity(v)
    })
  }, [])

  async function reConsent() {
    const bridge = window.overlay
    if (!bridge) return
    setScopeRejected(false)
    await bridge.signOut()
    await bridge.signIn() // 새 scope(쓰기) 동의 — prompt=consent 로 재동의 화면. canWrite·email 은 후속 broadcast 로 갱신.
  }

  async function doRefresh() {
    setRefreshing(true)
    try {
      await window.overlay?.refreshNow()
    } finally {
      setRefreshing(false)
    }
  }

  // 낙관적 업데이트: 로컬 상태를 먼저 반영(layoutDay 재계산)하고 IPC 쓰기 호출.
  // 실패면 롤백 + 사유 표시. 성공 시 자동 갱신하지 않음 — 재갱신 버튼/5분 폴링이 서버 정답으로 reconcile.
  async function applyWrite(
    mutate: (events: NormalizedEvent[]) => NormalizedEvent[],
    call: () => Promise<WriteResult>,
  ) {
    if (state.status !== "ready") return
    const prev = state
    const events = [...state.day.blocks.map((b) => b.event), ...state.day.allDay]
    // 서버 레이아웃과 같은 앵커(마지막 동기 시각)로 재계산 — now() 로 재앵커하면 편집마다 범위/그리드가 튄다.
    const day: DayLayout = layoutDay(mutate(events), new Date(state.lastSyncedAt))
    setState({ ...state, day })
    setFeedback(null)
    const res = await call()
    if (!res.ok) {
      setState(prev)
      setFeedback(writeFailureMessage(res.reason))
      if (res.reason === "insufficient-scope") setScopeRejected(true)
    }
  }

  function submitCreate(title: string, start: string, end: string) {
    const calendarId = primaryCalendarId
    if (!calendarId) return
    const tempId = `tmp-${Date.now()}`
    void applyWrite(
      (events) => [
        ...events,
        {
          id: tempId,
          title,
          start,
          end,
          allDay: false,
          calendarId,
          colorHex: null,
          meetingUrl: null,
          recurring: false,
        },
      ],
      () => window.overlay!.createEvent({ calendarId, title, start, end }),
    )
  }

  function submitEdit(event: NormalizedEvent, title: string, start: string, end: string) {
    void applyWrite(
      (events) => events.map((e) => (e.id === event.id ? { ...e, title, start, end } : e)),
      () =>
        window.overlay!.updateEvent({
          id: event.id,
          calendarId: event.calendarId,
          title,
          start,
          end,
        }),
    )
  }

  function submitMove(event: NormalizedEvent, start: string, end: string) {
    void applyWrite(
      (events) => events.map((e) => (e.id === event.id ? { ...e, start, end } : e)),
      () => window.overlay!.moveEvent({ id: event.id, calendarId: event.calendarId, start, end }),
    )
  }

  function submitDelete(event: NormalizedEvent) {
    void applyWrite(
      (events) => events.filter((e) => e.id !== event.id),
      () => window.overlay!.deleteEvent(event.id, event.calendarId),
    )
  }

  // 컨트롤 버튼 — 잠금="설정"(해제), 해제="저장"(투명도 영속 후 잠금). 토글 자체는 그대로.
  function onCtrl() {
    if (!state.locked) window.overlay?.saveOpacity(opacity)
    void window.overlay?.toggleLock()
  }

  const ready = state.status === "ready"
  const showActions = !state.locked && ready
  const canCreate = canWrite && primaryCalendarId !== null
  const draft = editing?.mode === "create" ? defaultDraft() : null

  return (
    <main className={state.locked ? "overlay" : "overlay unlocked"} style={{ opacity }}>
      <header className="ov-head">
        <span className="ov-status">
          {ready ? nowChip(state.now) : null}
          {ready ? <span className="ov-synced">갱신 {clock(state.lastSyncedAt)}</span> : null}
        </span>
        <div className="ov-actions">
          {showActions && canCreate ? (
            <OvButton
              className="icon-btn"
              aria-label="새 일정 추가"
              title="새 일정"
              onClick={() => setEditing({ mode: "create" })}
            >
              +
            </OvButton>
          ) : null}
          {showActions ? (
            <OvButton
              className={refreshing ? "icon-btn spinning" : "icon-btn"}
              aria-label="재갱신"
              title="재갱신"
              disabled={refreshing}
              onClick={() => void doRefresh()}
            >
              ↻
            </OvButton>
          ) : null}
          {/* 잠금 상태에서도 이 버튼만 클릭되게 — hover 시 main 이 이 영역만 통과를 끈다. */}
          <OvButton
            className="ctrl-btn"
            onClick={onCtrl}
            onMouseEnter={() => window.overlay?.setControlHover(true)}
            onMouseLeave={() => window.overlay?.setControlHover(false)}
          >
            {state.locked ? "설정" : "저장"}
          </OvButton>
        </div>
      </header>
      {showActions && (!canWrite || scopeRejected) ? (
        <div className="reconsent-banner">
          <span>편집하려면 권한 재동의가 필요해요</span>
          <OvButton className="reconsent-btn" onClick={() => void reConsent()}>
            재동의
          </OvButton>
        </div>
      ) : null}
      {feedback ? <div className="ov-feedback">{feedback}</div> : null}
      {showActions ? (
        <div className="ov-settings">
          <span className="ov-settings-label">투명도</span>
          <input
            type="range"
            className="ov-opacity-range"
            aria-label="오버레이 투명도"
            min={0.35}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
          />
        </div>
      ) : null}
      <Body
        state={state}
        canEdit={showActions && canWrite}
        onTap={(event) =>
          event.recurring
            ? setFeedback(writeFailureMessage("recurring-readonly"))
            : setEditing({ mode: "edit", event })
        }
        onMove={submitMove}
        onDelete={submitDelete}
      />
      {!state.locked ? (
        <div className="resize-grip" onPointerDown={startResize} aria-hidden="true">
          <span className="resize-grip-bar" />
        </div>
      ) : null}
      {editing?.mode === "edit" ? (
        <EditSheet
          mode="edit"
          initialTitle={editing.event.title}
          initialStart={editing.event.start}
          initialEnd={editing.event.end}
          onSave={(title, start, end) => {
            submitEdit(editing.event, title, start, end)
            setEditing(null)
          }}
          onDelete={() => {
            submitDelete(editing.event)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {editing?.mode === "create" && draft ? (
        <EditSheet
          mode="create"
          initialTitle=""
          initialStart={draft.start}
          initialEnd={draft.end}
          onSave={(title, start, end) => {
            submitCreate(title, start, end)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </main>
  )
}
