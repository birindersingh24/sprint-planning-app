import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskStore, TaskValidationError } from '../src/tasks.js';

test('creates tasks with defaults and normalized titles', () => {
  const store = new TaskStore();
  const task = store.create({ title: '  Review pull request  ' });

  assert.equal(task.title, 'Review pull request');
  assert.equal(task.status, 'todo');
  assert.equal(task.description, '');
  assert.equal(task.dueDate, null);
  assert.equal(store.get(task.id).id, task.id);
});

test('rejects invalid task input with a field-specific error', () => {
  const store = new TaskStore();

  assert.throws(
    () => store.create({ title: '   ' }),
    (error) => error instanceof TaskValidationError && error.field === 'title',
  );
  assert.throws(
    () => store.create({ title: 'Ship feature', dueDate: '2026-02-30' }),
    (error) => error instanceof TaskValidationError && error.field === 'dueDate',
  );
});

test('updates only supplied fields and can clear a due date', () => {
  const store = new TaskStore();
  const created = store.create({ title: 'Ship feature', dueDate: '2026-10-12' });
  const updated = store.update(created.id, { status: 'done', dueDate: null });

  assert.equal(updated.title, 'Ship feature');
  assert.equal(updated.status, 'done');
  assert.equal(updated.dueDate, null);
  assert.notEqual(updated.updatedAt, created.updatedAt);
});

test('returns null when updating or deleting a missing task', () => {
  const store = new TaskStore();

  assert.equal(store.update('missing', { status: 'done' }), null);
  assert.equal(store.delete('missing'), null);
});

test('does not expose stored task objects to callers', () => {
  const store = new TaskStore();
  const created = store.create({ title: 'Keep task stable' });
  created.title = 'Mutated outside store';

  assert.equal(store.get(created.id).title, 'Keep task stable');
});