import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../src/server.js';
import { JsonTaskRepository } from '../src/repository.js';

async function withServer(run) {
  const directory = await mkdtemp(join(tmpdir(), 'sprintboard-test-'));
  const repository = await new JsonTaskRepository(join(directory, 'tasks.json')).init();
  const server = createAppServer({ store: repository });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
    await rm(directory, { recursive: true, force: true });
  }
}

test('health endpoint reports service status', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

test('serves the browser app and health endpoint', async () => {
  await withServer(async (baseUrl) => {
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Product launch/);

    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

test('creates, filters, reads, updates, and deletes a task over HTTP', async () => {
  await withServer(async (baseUrl) => {
    const createdResponse = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Prepare evaluation notes', priority: 'high', assignee: 'Birinder' }),
    });
    assert.equal(createdResponse.status, 201);
    const { task: created } = await createdResponse.json();

    const filteredResponse = await fetch(`${baseUrl}/api/tasks?priority=high&q=evaluation`);
    assert.equal((await filteredResponse.json()).tasks.length, 1);

    const readResponse = await fetch(`${baseUrl}/api/tasks/${created.id}`);
    assert.equal((await readResponse.json()).task.title, 'Prepare evaluation notes');

    const updateResponse = await fetch(`${baseUrl}/api/tasks/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    });
    assert.equal((await updateResponse.json()).task.status, 'in_progress');

    const deleteResponse = await fetch(`${baseUrl}/api/tasks/${created.id}`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 200);

    const missingResponse = await fetch(`${baseUrl}/api/tasks/${created.id}`);
    assert.equal(missingResponse.status, 404);
  });
});

test('returns a structured error for invalid task input', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'Title must contain 1 to 120 characters',
      field: 'title',
    });
  });
});

test('rejects non-JSON and oversized request bodies', async () => {
  await withServer(async (baseUrl) => {
    const wrongType = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'title=hello',
    });
    assert.equal(wrongType.status, 400);
    assert.equal((await wrongType.json()).field, 'content-type');

    const tooLarge = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'a'.repeat(70_000) }),
    });
    assert.equal(tooLarge.status, 400);
    assert.match((await tooLarge.json()).error, /64 KB/);
  });
});

test('returns 405 and allowed methods for known API routes', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tasks`, { method: 'PUT' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, POST');
  });
});