export type CorridorCandidate = {
  gid: number;
  voltage_kv: number | null;
  sub_1: string | null;
  sub_2: string | null;
  source: string;
  circuits: number | null;
};

export function toggleGid(selected: number[], gid: number): number[] {
  const index = selected.indexOf(gid);
  if (index >= 0) {
    return [...selected.slice(0, index), ...selected.slice(index + 1)];
  }
  return [...selected, gid];
}

export function overlappingCandidates<T extends { gid: number }>(features: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const feature of features) {
    if (seen.has(feature.gid)) continue;
    seen.add(feature.gid);
    out.push(feature);
  }
  return out;
}

function connectorPhrase(connectors: ReadonlyArray<{ length_m: number }>): string {
  if (connectors.length === 0) return 'no connectors';
  const parts = connectors.map((connector) => `${Math.round(connector.length_m)} m`);
  if (parts.length === 1) return `connector ${parts[0]}`;
  const last = parts[parts.length - 1] ?? '';
  const rest = parts.slice(0, -1).join(', ');
  return `connectors ${rest} and ${last}`;
}

export function selectionSummary(
  pieces: ReadonlyArray<{ miles: number }>,
  connectors: ReadonlyArray<{ length_m: number }>,
): string {
  const totalMi = pieces.reduce((sum, piece) => sum + piece.miles, 0);
  const mi = totalMi.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const pieceLabel = pieces.length === 1 ? 'piece' : 'pieces';
  return `From line data: ${pieces.length} ${pieceLabel}, ${mi} mi, ${connectorPhrase(connectors)}`;
}

export function lineSelectTooltip(candidate: CorridorCandidate): string {
  const voltage =
    candidate.voltage_kv !== null
      ? `${Math.round(candidate.voltage_kv).toLocaleString('en-US')} kV`
      : '— kV';
  const ends =
    candidate.sub_1 && candidate.sub_2
      ? `${candidate.sub_1} – ${candidate.sub_2}`
      : candidate.sub_1 || candidate.sub_2 || '—';
  const source = candidate.source || '—';
  return `${voltage} · ${ends} · ${source}`;
}