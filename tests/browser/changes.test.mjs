import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

await import('../../static/changes.js');

test('laredo diff matches the calculator', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/laredo-changes.json', import.meta.url)));
  assert.deepEqual(globalThis.diffChanges(fixture.defaults, fixture.current), fixture.changes);
});

test('a dict where the template expects a dict, but current gives a scalar, throws naming that path', () => {
  const defaults = { a: { b: 1 } };
  const current = { a: 'not-a-dict' };
  assert.throws(
    () => globalThis.diffChanges(defaults, current),
    (err) => err instanceof globalThis.ShapeMismatchError && err.path === 'a'
  );
});

test('a list whose length differs from the template throws naming that path', () => {
  const defaults = { items: [1, 2, 3] };
  const current = { items: [1, 2] };
  assert.throws(
    () => globalThis.diffChanges(defaults, current),
    (err) => err instanceof globalThis.ShapeMismatchError && err.path === 'items'
  );
});

test('a shape mismatch nested below a real change still aborts the whole diff', () => {
  // `a` is a genuine, validly-shaped change; `nested.list`'s length mismatch
  // must still throw rather than returning `{a: 99}` as a partial result.
  const defaults = { a: 1, nested: { list: [1, 2] } };
  const current = { a: 99, nested: { list: [1] } };
  assert.throws(
    () => globalThis.diffChanges(defaults, current),
    (err) => err instanceof globalThis.ShapeMismatchError && err.path === 'nested.list'
  );
});

test('a NaN current value does not compare equal to a numeric default, and is encoded as "NaN" rather than serializing as null', () => {
  const defaults = { a: 1 };
  const current = { a: NaN };
  const changes = globalThis.diffChanges(defaults, current);
  // Recorded as a change: NaN !== 1, so it must not be silently dropped.
  assert.deepEqual(changes, { a: 'NaN' });
  // The same token `app/models.py`'s JSON sanitizer uses for a NaN result,
  // not the `null` that `JSON.stringify(NaN)` alone would produce.
  assert.equal(JSON.stringify(changes.a), '"NaN"');
  assert.notEqual(changes.a, null);
});
