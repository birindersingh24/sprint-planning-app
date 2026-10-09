import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

test('fails clearly when persisted task data is invalid', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sprintboard-corrupt-'));
  const filePath = join(directory, 'tasks.json');
  try {
    await import('node:fs/promises').then(({ writeFile }) => writeFile(filePath, '{broken', 'utf8'));
    const repository = new JsonTaskRepository(filePath);
    await assert.rejects(repository.init(), SyntaxError);
    assert.equal(await readFile(filePath, 'utf8'), '{broken');
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