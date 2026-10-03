/**
 * Patrol rounds from QR scans. A round is one visit to every active checkpoint of the site. A scan of a checkpoint already seen in
 * the current round starts the next round (the current one stays incomplete, with what it missed). When the site wants an order, a scan
 * out of sequence marks its round out of order but still counts as a visit.
 */
export interface CheckpointRef {
  id: string;
  name: string;
  seq: number;
}

export interface ScanRef {
  checkpointId: string;
  at: Date;
}

export interface Round {
  index: number;
  complete: boolean;
  outOfOrder: boolean;
  startedAt: Date;
  visited: string[];
  missed: string[];
}

export interface PatrolEvaluation {
  rounds: Round[];
  completeRounds: number;
  roundsRequired: number;
  shortfall: number;
}

export function evaluatePatrol(checkpoints: readonly CheckpointRef[], scans: readonly ScanRef[], ordered: boolean, roundsRequired: number): PatrolEvaluation {
  const ranked = [...checkpoints].sort((a, b) => a.seq - b.seq);
  const known = new Map(ranked.map((c) => [c.id, c]));
  const rounds: Round[] = [];
  let current: { startedAt: Date; seen: string[]; outOfOrder: boolean } | null = null;

  const close = () => {
    if (!current) return;
    const missed = ranked.filter((c) => !current!.seen.includes(c.id)).map((c) => c.name);
    rounds.push({ index: rounds.length + 1, complete: missed.length === 0, outOfOrder: current.outOfOrder, startedAt: current.startedAt, visited: current.seen.map((id) => known.get(id)!.name), missed });
    current = null;
  };

  for (const scan of [...scans].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const checkpoint = known.get(scan.checkpointId);
    if (!checkpoint) continue;
    if (current && current.seen.includes(checkpoint.id)) close();
    if (!current) current = { startedAt: scan.at, seen: [], outOfOrder: false };
    if (ordered && ranked[current.seen.length]?.id !== checkpoint.id) current.outOfOrder = true;
    current.seen.push(checkpoint.id);
    if (current.seen.length === ranked.length) close();
  }
  close();

  const completeRounds = rounds.filter((r) => r.complete).length;
  return { rounds, completeRounds, roundsRequired, shortfall: Math.max(0, roundsRequired - completeRounds) };
}
