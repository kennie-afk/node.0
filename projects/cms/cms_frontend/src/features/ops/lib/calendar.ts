import { isoToLocalDate, minutesIntoDay } from './dates';

export interface Span {
  id: number;
  startsAt: string;
  endsAt: string;
}

export interface Placed<T extends Span> {
  item: T;
  /** Zero-based lane inside its overlap cluster. */
  lane: number;
  /** How many lanes the cluster needs, so the block knows its width. */
  lanes: number;
  startMinute: number;
  endMinute: number;
}

/**
 * Lays one day's bookings out side by side: anything that overlaps in time gets its own lane, and
 * every block in a connected cluster shares the same lane count. A booking that runs past
 * midnight is clipped to the day it is drawn on.
 */
export function layoutDay<T extends Span>(items: T[], day: string): Placed<T>[] {
  const inDay = items
    .map((item) => {
      const startDay = isoToLocalDate(item.startsAt);
      const endDay = isoToLocalDate(item.endsAt);
      if (day < startDay || day > endDay) return null;
      const start = day === startDay ? minutesIntoDay(item.startsAt) : 0;
      const end = day === endDay ? minutesIntoDay(item.endsAt) || 24 * 60 : 24 * 60;
      return { item, startMinute: start, endMinute: Math.max(end, start + 15) };
    })
    .filter((x): x is { item: T; startMinute: number; endMinute: number } => x !== null)
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.item.id - b.item.id);

  const placed: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const p of cluster) p.lanes = lanes;
    placed.push(...cluster);
    cluster = [];
    laneEnds.length = 0;
  };

  for (const entry of inDay) {
    if (entry.startMinute >= clusterEnd && cluster.length > 0) flush();
    let lane = laneEnds.findIndex((end) => end <= entry.startMinute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.endMinute);
    } else {
      laneEnds[lane] = entry.endMinute;
    }
    cluster.push({ ...entry, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, entry.endMinute);
  }
  if (cluster.length > 0) flush();
  return placed;
}

/** True when two half-open time ranges share any time. */
export function overlaps(a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }): boolean {
  return new Date(a.startsAt) < new Date(b.endsAt) && new Date(b.startsAt) < new Date(a.endsAt);
}
