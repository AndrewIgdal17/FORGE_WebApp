// Pure diff between the deployed calculator's defaults and the form's current
// values, mirroring `forge.diff_changes` (`forge/contract.py`).
//
// Walk rules (must match `forge.diff_changes` exactly):
//   - A key present in `defaults` and absent from `current` is not a change,
//     even when the default is not null (the server fills it from its own
//     defaults).
//   - A key present in `current` and absent from `defaults` is ignored.
//   - Dicts/lists recurse. A structural mismatch — a present value sitting
//     where the template expects a dict or list, or a list whose length
//     differs from the template's — throws a `ShapeMismatchError` naming
//     the offending path, matching `forge.diff_changes`'s `UnknownInputPath`.
//   - Leaves are compared via a canonical JSON string (sorted keys, no
//     whitespace, `Infinity`/`-Infinity`/`NaN` encoded as strings) and only
//     recorded when that string differs.

export class ShapeMismatchError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(
      'Input shape does not match the calculator defaults at "' + path + '"',
    );
    this.name = 'ShapeMismatchError';
    this.path = path;
  }
}

export interface ForgeDocument {
  version: '3.0';
  customName: string;
  calculator: unknown;
  defaults_id: string;
  changes: Record<string, unknown>;
  results: unknown;
}

function encodeValue(value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value)) return value.map(encodeValue);
    const out: Record<string, unknown> = {};
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      out[key] = encodeValue(record[key]);
    }
    return out;
  }
  if (typeof value === 'number') {
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    // `JSON.stringify(NaN)` silently becomes `null`. Encode it as the string
    // "NaN" instead, the same token the server uses, so a NaN never
    // round-trips as `null`.
    if (Number.isNaN(value)) return 'NaN';
  }
  return value;
}

function stringifySorted(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stringifySorted).join(',') + ']';
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    '{' +
    keys
      .map((key) => JSON.stringify(key) + ':' + stringifySorted(record[key]))
      .join(',') +
    '}'
  );
}

function canonicalDumps(value: unknown): string {
  return stringifySorted(encodeValue(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function walk(
  defaultsNode: unknown,
  currentNode: unknown,
  prefix: string,
  changes: Record<string, unknown>,
): void {
  if (currentNode === undefined) return;

  if (isPlainObject(defaultsNode)) {
    if (!isPlainObject(currentNode)) throw new ShapeMismatchError(prefix);
    for (const key of Object.keys(defaultsNode)) {
      const path = prefix ? prefix + '.' + key : key;
      walk(defaultsNode[key], currentNode[key], path, changes);
    }
    return;
  }

  if (Array.isArray(defaultsNode)) {
    if (
      !Array.isArray(currentNode) ||
      currentNode.length !== defaultsNode.length
    ) {
      throw new ShapeMismatchError(prefix);
    }
    defaultsNode.forEach((child, index) => {
      walk(child, currentNode[index], prefix + '[' + index + ']', changes);
    });
    return;
  }

  if (canonicalDumps(defaultsNode) !== canonicalDumps(currentNode)) {
    changes[prefix] = encodeValue(currentNode);
  }
}

/**
 * Diff `current` against `defaults`, returning only the leaves that differ
 * (as a flat `{path: value}` map keyed by dotted/bracketed paths).
 *
 * Throws `ShapeMismatchError` (with a `.path`) instead of returning a
 * partial map when `current`'s shape disagrees with `defaults` anywhere.
 */
export function diffChanges(
  defaults: unknown,
  current: unknown,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  walk(defaults, current, '', changes);
  return changes;
}

/**
 * Build a `.forge` v3.0 document. `calculator` is `calculator_info()`
 * (package, version, commit, defaults_id); `defaultsId` is the defaults
 * identity the diff was computed against; `changes` is
 * `diffChanges(defaults, currentInputs)`; `results` is the calculator's
 * response (or null if never run).
 */
export function forgeDocument(
  name: string,
  calculator: unknown,
  defaultsId: string,
  changes: Record<string, unknown>,
  results: unknown,
): ForgeDocument {
  return {
    version: '3.0',
    customName: name,
    calculator,
    defaults_id: defaultsId,
    changes,
    results,
  };
}

/**
 * Accept only version "3.0" `.forge` documents. Throws for any other
 * version (including the retired "1.0" and "2.0" formats) and for a
 * document missing `changes` or `defaults_id`. A 3.0 document whose
 * `defaults_id` differs from the caller's current defaults id is still
 * accepted here — rejection is about shape only.
 */
export function acceptedForge(document: unknown): ForgeDocument {
  const doc = document as {
    version?: unknown;
    changes?: unknown;
    defaults_id?: unknown;
  } | null;
  if (!doc || doc.version !== '3.0' || !doc.changes || !doc.defaults_id) {
    throw new Error('unsupported forge file');
  }
  return document as ForgeDocument;
}
