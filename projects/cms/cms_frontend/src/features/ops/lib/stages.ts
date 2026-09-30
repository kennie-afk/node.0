import type { Stage } from '../../../api/visitorsApi';

export const STAGE_LABEL: Record<Stage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  VISITED_AGAIN: 'Visited again',
  CLASS: 'In newcomers class',
  JOINED: 'Joined',
  LOST: 'Lost touch'
};

export const STAGE_ORDER: readonly Stage[] = ['NEW', 'CONTACTED', 'VISITED_AGAIN', 'CLASS', 'JOINED', 'LOST'];

/** The natural next step, or null at the end of the road (Joined and Lost). */
export function nextStage(stage: Stage): Stage | null {
  if (stage === 'JOINED' || stage === 'LOST') return null;
  return STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1];
}

export function conversionPercent(rate: number): string {
  // The API returns a 0-1 fraction.
  return `${Math.round(rate * 1000) / 10}%`;
}
