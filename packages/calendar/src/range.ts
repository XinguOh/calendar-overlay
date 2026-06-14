/**
 * 일정 조회 범위 — 로컬 시간 기준 오늘 00:00 ~ 내일 10:00.
 * main 이 Google `events.list` 의 timeMin/timeMax 로 쓴다 (Date → .toISOString()).
 */
export function calendarRange(now: Date): { timeMin: Date; timeMax: Date } {
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0, 0)
  return { timeMin, timeMax }
}
