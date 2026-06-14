import type { GoogleEvent, GoogleEventDateTime, NormalizedEvent, RawCalendarEvent } from "./types"

// description/location 안에서 첫 URL 을 뽑는다 (회의 링크 fallback). 닫는 괄호·따옴표·공백 전까지.
const URL_RE = /https?:\/\/[^\s<>"')\]]+/i

function firstUrl(text: string | undefined): string | null {
  if (!text) return null
  const m = text.match(URL_RE)
  return m ? m[0] : null
}

/** 회의 링크: hangoutLink → conferenceData video entryPoint → location/description 내 첫 URL. */
function resolveMeetingUrl(e: GoogleEvent): string | null {
  if (e.hangoutLink) return e.hangoutLink
  const video = e.conferenceData?.entryPoints?.find(
    (p) => p.entryPointType === "video" && Boolean(p.uri),
  )
  if (video?.uri) return video.uri
  return firstUrl(e.location) ?? firstUrl(e.description)
}

/** 색: event.colorId 가 eventColorMap 에 있으면 그 hex, 없으면 캘린더 색 fallback. */
function resolveColor(
  e: GoogleEvent,
  calendarColorHex: string | null,
  eventColorMap: Record<string, string> | undefined,
): string | null {
  if (e.colorId && eventColorMap) {
    const hex = eventColorMap[e.colorId]
    if (hex) return hex
  }
  return calendarColorHex
}

type Bound = { iso: string; allDay: boolean }

function toBound(dt: GoogleEventDateTime | undefined): Bound | null {
  if (!dt) return null
  if (dt.dateTime) return { iso: dt.dateTime, allDay: false }
  if (dt.date) return { iso: `${dt.date}T00:00:00`, allDay: true }
  return null
}

/**
 * Google event 1건 → NormalizedEvent. 정규화 불가(취소·시작/종료 없음)면 null.
 * eventColorMap: colorId → hex (Google `colors.get` 의 event 팔레트). 옵션.
 */
export function normalizeEvent(
  raw: RawCalendarEvent,
  eventColorMap?: Record<string, string>,
): NormalizedEvent | null {
  const { event: e, calendarId, calendarColorHex } = raw
  if (e.status === "cancelled") return null

  const start = toBound(e.start)
  const end = toBound(e.end)
  if (!start || !end) return null

  return {
    id: e.id ?? `${calendarId}:${start.iso}`,
    title: e.summary?.trim() || "(제목 없음)",
    start: start.iso,
    end: end.iso,
    allDay: start.allDay,
    calendarId,
    colorHex: resolveColor(e, calendarColorHex, eventColorMap),
    meetingUrl: resolveMeetingUrl(e),
    recurring: Boolean(e.recurringEventId),
  }
}

/**
 * raw 일정 목록 → NormalizedEvent 배열. 정규화 불가 항목은 제외, 시작 시각 오름차순 정렬.
 */
export function normalizeEvents(
  rawList: RawCalendarEvent[],
  eventColorMap?: Record<string, string>,
): NormalizedEvent[] {
  const out: NormalizedEvent[] = []
  for (const raw of rawList) {
    const n = normalizeEvent(raw, eventColorMap)
    if (n) out.push(n)
  }
  out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  return out
}
