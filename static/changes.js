// Pure diff between the deployed calculator's defaults and the form's current
// values, mirroring `forge.diff_changes` (installed `forge-calc` package,
// `forge/contract.py`) so the browser sends the server only what the user
// changed.
//
// Walk rules (must match `forge.diff_changes` exactly):
//   - A key present in `defaults` and absent from `current` is not a change,
//     even when the default is not null (the server fills it from its own
//     defaults).
//   - A key present in `current` and absent from `defaults` is ignored.
//   - Dicts/lists recurse. A structural mismatch -- a present value sitting
//     where the template expects a dict or list, or a list whose length
//     differs from the template's -- throws a `ShapeMismatchError` naming
//     the offending path, matching `forge.diff_changes`'s
//     `UnknownInputPath`. Silently skipping that subtree would drop the
//     user's values for it without telling anyone (e.g. after the deployed
//     calculator's defaults change shape underneath an already-rendered
//     form), so callers must not catch this and send a partial `changes`
//     map; they must stop and surface the path instead.
//   - Leaves are compared via a canonical JSON string (sorted keys, no
//     whitespace, `Infinity`/`-Infinity`/`NaN` encoded as strings) and only
//     recorded when that string differs.
(function () {
  'use strict';

  function encodeValue(value) {
    if (value !== null && typeof value === 'object') {
      if (Array.isArray(value)) return value.map(encodeValue);
      var out = {};
      Object.keys(value).forEach(function (key) { out[key] = encodeValue(value[key]); });
      return out;
    }
    if (typeof value === 'number') {
      if (value === Infinity) return 'Infinity';
      if (value === -Infinity) return '-Infinity';
      // `JSON.stringify(NaN)` silently becomes `null`, which would make a
      // NaN current value indistinguishable from an explicit null and from
      // a missing field. Encode it as the string "NaN" instead, the same
      // token `app/models.py`'s `_sanitize_floats_for_json` uses for a NaN
      // result value, so a NaN never round-trips as `null`.
      if (Number.isNaN(value)) return 'NaN';
    }
    return value;
  }

  function stringifySorted(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(stringifySorted).join(',') + ']';
    }
    var keys = Object.keys(value).sort();
    return '{' + keys.map(function (key) {
      return JSON.stringify(key) + ':' + stringifySorted(value[key]);
    }).join(',') + '}';
  }

  function canonicalDumps(value) {
    return stringifySorted(encodeValue(value));
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /** Thrown by `diffChanges` when `current`'s shape at `path` disagrees with
   * `defaults` (wrong type where a dict/list is expected, or a list whose
   * length differs). Mirrors `forge`'s `UnknownInputPath`. */
  function ShapeMismatchError(path) {
    Error.call(this);
    if (Error.captureStackTrace) Error.captureStackTrace(this, ShapeMismatchError);
    this.name = 'ShapeMismatchError';
    this.path = path;
    this.message = 'Input shape does not match the calculator defaults at "' + path + '"';
  }
  ShapeMismatchError.prototype = Object.create(Error.prototype);
  ShapeMismatchError.prototype.constructor = ShapeMismatchError;

  function walk(defaultsNode, currentNode, prefix, changes) {
    if (currentNode === undefined) return;

    if (isPlainObject(defaultsNode)) {
      if (!isPlainObject(currentNode)) throw new ShapeMismatchError(prefix);
      Object.keys(defaultsNode).forEach(function (key) {
        var path = prefix ? prefix + '.' + key : key;
        walk(defaultsNode[key], currentNode[key], path, changes);
      });
      return;
    }

    if (Array.isArray(defaultsNode)) {
      if (!Array.isArray(currentNode) || currentNode.length !== defaultsNode.length) {
        throw new ShapeMismatchError(prefix);
      }
      defaultsNode.forEach(function (child, index) {
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
   * Callers must not swallow this and send the partial `changes` collected
   * so far — they must stop and surface the path to the user.
   */
  function diffChanges(defaults, current) {
    var changes = {};
    walk(defaults, current, '', changes);
    return changes;
  }

  /**
   * Build a `.forge` v3.0 document. `calculator` is `calculator_info()`
   * (package, version, commit, defaults_id) so the file records which
   * calculator produced it; `defaultsId` is the `C.defaultsId` the diff was
   * computed against; `changes` is `diffChanges(C.defaults, currentInputs)`;
   * `results` is the calculator's response (or null if never run).
   */
  function forgeDocument(customName, calculator, defaultsId, changes, results) {
    return { version: '3.0', customName: customName, calculator: calculator, defaults_id: defaultsId, changes: changes, results: results };
  }

  /**
   * Accept only version "3.0" `.forge` documents. Throws for any other
   * version (including the retired "1.0" and "2.0" formats) and for a
   * document missing `changes` or `defaults_id`. A 3.0 document whose
   * `defaults_id` differs from the caller's current `C.defaultsId` is still
   * accepted here -- the caller re-applies `changes` onto the current
   * defaults and surfaces both identities; rejection is about shape only.
   */
  function acceptedForge(document) {
    if (!document || document.version !== '3.0' || !document.changes || !document.defaults_id) {
      throw new Error('unsupported forge file');
    }
    return document;
  }

  if (typeof document === 'undefined') {
    globalThis.diffChanges = diffChanges;
    globalThis.ShapeMismatchError = ShapeMismatchError;
    globalThis.forgeDocument = forgeDocument;
    globalThis.acceptedForge = acceptedForge;
  } else {
    window.FORGE = window.FORGE || {};
    window.FORGE.diffChanges = diffChanges;
    window.FORGE.ShapeMismatchError = ShapeMismatchError;
    window.FORGE.forgeDocument = forgeDocument;
    window.FORGE.acceptedForge = acceptedForge;
  }
})();
