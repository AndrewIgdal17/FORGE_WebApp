interface PathSegment {
  key: string;
  indexes: number[];
}

/** `tiers[0]` → key `tiers`, indexes `[0]`. Matches calculator path syntax. */
function parseSegment(segment: string): PathSegment {
  const indexes: number[] = [];
  const key = segment.replace(/\[(\d+)\]/g, (_match, digits: string) => {
    indexes.push(Number(digits));
    return '';
  });
  return { key, indexes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readSegment(current: unknown, segment: string): unknown {
  if (!isRecord(current)) return undefined;
  const { key, indexes } = parseSegment(segment);
  let next: unknown = current[key];
  for (const index of indexes) {
    if (!Array.isArray(next) || index >= next.length) return undefined;
    next = next[index];
  }
  return next;
}

export function getValueAtPath(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  if (!obj || !path) return undefined;
  let current: unknown = obj;
  for (const part of path.split('.')) {
    current = readSegment(current, part);
    if (current === undefined) return undefined;
  }
  return current;
}

export function setValueAtPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split('.');
  let current: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const segment = parts[i];
    if (!isRecord(current)) return;
    const { key, indexes } = parseSegment(segment);
    if (current[key] == null) {
      if (indexes.length > 0) return;
      current[key] = {};
    }
    let next: unknown = current[key];
    for (const index of indexes) {
      if (!Array.isArray(next) || next[index] == null) return;
      next = next[index];
    }
    current = next;
  }

  if (!isRecord(current)) return;
  const { key, indexes } = parseSegment(parts[parts.length - 1]);
  if (indexes.length === 0) {
    current[key] = value;
    return;
  }
  let list: unknown = current[key];
  for (let i = 0; i < indexes.length - 1; i++) {
    const index = indexes[i];
    if (!Array.isArray(list) || list[index] == null) return;
    list = list[index];
  }
  const finalIndex = indexes[indexes.length - 1];
  if (!Array.isArray(list) || finalIndex >= list.length) return;
  list[finalIndex] = value;
}

export function flattenObject(
  obj: unknown,
  prefix?: string,
): Array<{ path: string; value: unknown }> {
  const rows: Array<{ path: string; value: unknown }> = [];
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const val = record[key];
    const fullPath = prefix ? prefix + '.' + key : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      rows.push(...flattenObject(val, fullPath));
    } else {
      rows.push({ path: fullPath, value: val });
    }
  }
  return rows;
}
