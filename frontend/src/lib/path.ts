export function getValueAtPath(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setValueAtPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (current[key] == null) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
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
