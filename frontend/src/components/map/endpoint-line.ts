import type { SubstationIdentity } from '@/hooks/use-route-draw';

export function endpointLine(
  label: string,
  subregion: string | null,
  gea: string | null,
  state: string | null,
  hit: SubstationIdentity | null,
  iso: string | null = null,
  priceZone: string | null = null,
): string {
  const parts = [subregion, gea, state].filter((part): part is string => Boolean(part));
  const region = parts.length > 0 ? parts.join(' / ') : '—';
  const market = [iso, priceZone].filter((part): part is string => Boolean(part));
  const regionText = market.length > 0 ? `${region} · ${market.join(' · ')}` : region;
  const name = hit?.name && !/^UNKNOWN\d*$/i.test(hit.name) ? hit.name : null;
  if (!name) return `${label}: ${regionText}`;
  const volts = hit?.voltage_kv ? ` (${hit.voltage_kv} kV)` : '';
  return `${label}: ${name}${volts} — ${regionText}`;
}
