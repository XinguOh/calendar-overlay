import type { NormalizedEvent, OverlaySelection, ReadyNow } from "./types"

const UPCOMING_LIMIT = 2

/**
 * 정규화된 일정 + 현재 시각 → 오버레이 선택 결과.
 *
 * - 진행 중(start ≤ now < end) timed 일정이 있으면 in-event (가장 먼저 끝나는 것).
 * - 없으면 free + 다음 시작 일정까지 남은 시간.
 * - upcoming: 시작이 now 이후인 timed 일정, 가까운 순 최대 2개.
 *
 * all-day 일정은 "지금/다음" 후보에서 제외한다 (배경 정보일 뿐 시간 점유가 아님).
 */
export function selectOverlay(events: NormalizedEvent[], now: Date): OverlaySelection {
  const nowMs = now.getTime()
  const timed = events.filter((e) => !e.allDay)

  // 진행 중: start ≤ now < end. 가장 먼저 끝나는 것을 "지금"으로.
  let current: NormalizedEvent | null = null
  let currentEndMs = Infinity
  for (const e of timed) {
    const startMs = Date.parse(e.start)
    const endMs = Date.parse(e.end)
    if (startMs <= nowMs && nowMs < endMs && endMs < currentEndMs) {
      current = e
      currentEndMs = endMs
    }
  }

  // 다음 일정: 시작이 now 이후, 가까운 순.
  const future = timed
    .filter((e) => Date.parse(e.start) > nowMs)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  const upcoming = future.slice(0, UPCOMING_LIMIT)

  let nowState: ReadyNow
  if (current) {
    nowState = { kind: "in-event", event: current, remainingMs: currentEndMs - nowMs }
  } else {
    const nextEvent = future[0]
    nowState = {
      kind: "free",
      next: nextEvent
        ? { event: nextEvent, startsInMs: Date.parse(nextEvent.start) - nowMs }
        : null,
    }
  }

  return { now: nowState, upcoming }
}
