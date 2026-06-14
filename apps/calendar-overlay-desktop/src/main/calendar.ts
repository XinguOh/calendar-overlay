import type {
  EventDraft,
  EventPatch,
  GoogleEvent,
  NormalizedEvent,
  RawCalendarEvent,
  WriteResult,
} from "@repo/calendar"
import { calendarRange, normalizeEvents } from "@repo/calendar"

import { getAccessToken, setAccountEmail } from "./auth"

const CAL_API = "https://www.googleapis.com/calendar/v3"

type CalendarListEntry = {
  id: string
  primary?: boolean
  selected?: boolean
  backgroundColor?: string
}

/**
 * selected/visible 캘린더의 이벤트를 오늘 00:00~내일 10:00 범위로 가져와 정규화한다.
 * recurring 은 singleEvents=true 로 펼친다. 한 캘린더 실패는 전체를 막지 않고 건너뛴다.
 */
export async function fetchEvents(now: Date): Promise<NormalizedEvent[]> {
  const token = await getAccessToken()
  const headers = { Authorization: `Bearer ${token}` }

  // calendarList 와 색 팔레트는 서로 독립 → 동시에 가져온다.
  const [listRes, eventColorMap] = await Promise.all([
    fetch(`${CAL_API}/users/me/calendarList`, { headers }),
    fetchEventColors(headers),
  ])
  if (!listRes.ok) throw new Error("calendar_list_failed")
  const listJson = (await listRes.json()) as { items?: CalendarListEntry[] }
  const calendars = (listJson.items ?? []).filter((c) => c.selected || c.primary)

  setAccountEmail(calendars.find((c) => c.primary)?.id ?? null)

  const { timeMin, timeMax } = calendarRange(now)

  // 캘린더별 이벤트는 서로 독립 → 병렬. 한 캘린더 실패는 [] 로 건너뛰고 전체를 막지 않는다.
  const perCalendar = await Promise.all(
    calendars.map(async (cal): Promise<RawCalendarEvent[]> => {
      try {
        const params = new URLSearchParams({
          singleEvents: "true",
          orderBy: "startTime",
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          maxResults: "50",
        })
        const evRes = await fetch(
          `${CAL_API}/calendars/${encodeURIComponent(cal.id)}/events?${params.toString()}`,
          { headers },
        )
        if (!evRes.ok) return []
        const evJson = (await evRes.json()) as { items?: GoogleEvent[] }
        return (evJson.items ?? []).map((event) => ({
          event,
          calendarId: cal.id,
          calendarColorHex: cal.backgroundColor ?? null,
        }))
      } catch {
        return []
      }
    }),
  )

  return normalizeEvents(perCalendar.flat(), eventColorMap)
}

type GoogleApiError = { error?: { errors?: { reason?: string }[] } }

/** 쓰기 실패 응답 → WriteResult.reason. 403 insufficientPermissions = scope 부족(재동의 필요). */
async function toWriteFailure(res: Response): Promise<Extract<WriteResult, { ok: false }>> {
  if (res.status === 403) {
    try {
      const body = (await res.json()) as GoogleApiError
      if (body.error?.errors?.some((e) => e.reason === "insufficientPermissions")) {
        return { ok: false, reason: "insufficient-scope" }
      }
    } catch {
      // fallthrough
    }
  }
  return { ok: false, reason: "unknown" }
}

/** 일정 생성(events.insert). renderer 의도(EventDraft)만 받아 main 이 Google 호출. 성공 200. */
export async function createEvent(draft: EventDraft): Promise<WriteResult> {
  try {
    const token = await getAccessToken()
    const res = await fetch(`${CAL_API}/calendars/${encodeURIComponent(draft.calendarId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: draft.title,
        start: { dateTime: draft.start },
        end: { dateTime: draft.end },
      }),
    })
    if (!res.ok) return toWriteFailure(res)
    return { ok: true }
  } catch {
    return { ok: false, reason: "network" }
  }
}

/** 일정 부분 수정(events.patch) — 제목 수정·시간 이동 공용. 보낸 필드만 변경. */
export async function patchEvent(patch: EventPatch): Promise<WriteResult> {
  try {
    const token = await getAccessToken()
    const body: Record<string, unknown> = {}
    if (patch.title !== undefined) body.summary = patch.title
    if (patch.start !== undefined) body.start = { dateTime: patch.start }
    if (patch.end !== undefined) body.end = { dateTime: patch.end }
    const res = await fetch(
      `${CAL_API}/calendars/${encodeURIComponent(patch.calendarId)}/events/${encodeURIComponent(patch.id)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) return toWriteFailure(res)
    return { ok: true }
  } catch {
    return { ok: false, reason: "network" }
  }
}

/** 일정 삭제(events.delete). 성공 204 빈 body — res.json() 호출하지 않는다. */
export async function deleteEvent(id: string, calendarId: string): Promise<WriteResult> {
  try {
    const token = await getAccessToken()
    const res = await fetch(
      `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    )
    // 204 No Content = 성공. 200 도 허용. 그 외는 실패 매핑.
    if (res.status === 204 || res.ok) return { ok: true }
    return toWriteFailure(res)
  } catch {
    return { ok: false, reason: "network" }
  }
}

/** Google `colors.get` 의 event 팔레트 → colorId → background hex. 실패하면 undefined(캘린더 색 폴백). */
async function fetchEventColors(
  headers: Record<string, string>,
): Promise<Record<string, string> | undefined> {
  try {
    const res = await fetch(`${CAL_API}/colors`, { headers })
    if (!res.ok) return undefined
    const json = (await res.json()) as { event?: Record<string, { background?: string }> }
    if (!json.event) return undefined
    const map: Record<string, string> = {}
    for (const [id, color] of Object.entries(json.event)) {
      if (color.background) map[id] = color.background
    }
    return map
  } catch {
    return undefined
  }
}
