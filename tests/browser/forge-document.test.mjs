import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptedForge, forgeDocument } from '../../frontend/src/lib/changes.ts';

test('forgeDocument builds a version 3.0 document from its parts', () => {
  const calculator = { package: 'forge-calc', version: '1.1.0', commit: 'abc123', defaults_id: 'sha256:deadbeef' };
  const changes = { '01_project_technical_details.project.capacity_mw': 500 };
  const results = { bcr: { bcr_ratepayer: 1.2 } };

  const doc = forgeDocument('My Scenario', calculator, 'sha256:deadbeef', changes, results);

  assert.deepEqual(doc, {
    version: '3.0',
    customName: 'My Scenario',
    calculator,
    defaults_id: 'sha256:deadbeef',
    changes,
    results,
  });
});

test('acceptedForge returns a well-formed 3.0 document unchanged', () => {
  const doc = { version: '3.0', changes: { a: 1 }, defaults_id: 'sha256:deadbeef' };
  assert.equal(acceptedForge(doc), doc);
});

test('acceptedForge rejects a 2.0 document', () => {
  assert.throws(() => acceptedForge({ version: '2.0' }), /unsupported forge file/);
});

test('acceptedForge rejects a 1.0 document', () => {
  assert.throws(() => acceptedForge({ version: '1.0', inputs: {} }), /unsupported forge file/);
});

test('acceptedForge rejects a 3.0 document missing changes', () => {
  assert.throws(
    () => acceptedForge({ version: '3.0', defaults_id: 'sha256:deadbeef' }),
    /unsupported forge file/
  );
});

test('acceptedForge rejects a 3.0 document missing defaults_id', () => {
  assert.throws(
    () => acceptedForge({ version: '3.0', changes: {} }),
    /unsupported forge file/
  );
});

test('acceptedForge rejects a missing document', () => {
  assert.throws(() => acceptedForge(undefined), /unsupported forge file/);
});
