import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonTaskRepository } from '../src/repository.js';

test('persists changes across repository instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sprintboard-repository-'));
  const filePath = join(directory, 'nested', 'tasks.json');
  try {
    const first = await new JsonTaskRepository(filePath, [{ title: 'Seed item' }]).init();
    const created = await first.create({ title: 'Persist me', priority: 'high' });
    await first.update(created.id, { status: 'done' });

    const second = await new JsonTaskRepository(filePath, [{ title: 'Should not reseed' }]).init();
    const persisted = await second.get(created.id);
    assert.equal(persisted.title, 'Persist me');
    assert.equal(persisted.status, 'done');
    assert.equal((await second.list()).length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('preserves malformed JSON and starts with seed data after recovery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sprintboard-corrupt-'));
  const filePath = join(directory, 'tasks.json');
  try {
    await writeFile(filePath, '{broken', 'utf8');
    const repository = await new JsonTaskRepository(filePath, [{ title: 'Recovered starter task' }]).init();
    assert.equal((await repository.list())[0].title, 'Recovered starter task');
    const files = await readdir(directory);
    const quarantineFile = files.find((name) => name.startsWith('tasks.json.corrupt-'));
    assert.ok(quarantineFile);
    assert.equal(await readFile(join(directory, quarantineFile), 'utf8'), '{broken');
    assert.match(await readFile(filePath, 'utf8'), /Recovered starter task/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('recovers structurally invalid task records instead of loading them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sprintboard-invalid-record-'));
  const filePath = join(directory, 'tasks.json');
  try {
    const invalidRecords = JSON.stringify([{ id: 'broken-task', title: '', status: 'unknown' }]);
    await writeFile(filePath, invalidRecords, 'utf8');
    const repository = await new JsonTaskRepository(filePath, [{ title: 'Safe seed' }]).init();
    assert.deepEqual((await repository.list()).map((task) => task.title), ['Safe seed']);
    const files = await readdir(directory);
    const quarantineFile = files.find((name) => name.startsWith('tasks.json.corrupt-'));
    assert.equal(await readFile(join(directory, quarantineFile), 'utf8'), invalidRecords);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('serializes concurrent writes without losing tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sprintboard-concurrent-'));
  try {
    const repository = await new JsonTaskRepository(join(directory, 'tasks.json')).init();
    await Promise.all(Array.from({ length: 12 }, (_, index) => repository.create({ title: `Task ${index}` })));
    assert.equal((await repository.list()).length, 12);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});