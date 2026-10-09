import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonTaskRepository } from './repository.js';
import { sampleTasks } from './seed.js';
import { TaskConflictError, TaskValidationError } from './tasks.js';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const maximumBodyBytes = 64 * 1024;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(payload));
}

function taskVersionHeader(task) {
  return { etag: `"${task.updatedAt}"` };
}

async function readJson(request) {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new TaskValidationError('Content-Type must be application/json', 'content-type');
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maximumBodyBytes) {
      throw new TaskValidationError('Request body exceeds 64 KB', 'body');
    }
    chunks.push(chunk);
  }

  if (totalBytes === 0) throw new TaskValidationError('Request body is required', 'body');

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new TaskValidationError('Request body must contain valid JSON', 'body');
  }
}

function filteredTasks(tasks, searchParams) {
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const query = searchParams.get('q')?.trim().toLocaleLowerCase();
  const assignee = searchParams.get('assignee');

  return tasks.filter((task) => {
    if (status && task.status !== status) return false;
    if (priority && task.priority !== priority) return false;
    if (assignee && task.assignee !== assignee) return false;
    if (query && !`${task.title} ${task.description} ${task.label}`.toLocaleLowerCase().includes(query)) return false;
    return true;
  });
}

async function serveStatic(response, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = resolve(publicDirectory, relativePath);
  if (!filePath.startsWith(resolve(publicDirectory) + '/')) return false;

  try {
    await access(filePath);
  } catch {
    return false;
  }

  const contentType = contentTypes[extname(filePath)];
  if (!contentType) return false;
  response.writeHead(200, { 'content-type': contentType, 'x-content-type-options': 'nosniff' });
  createReadStream(filePath).pipe(response);
  return true;
}

export function createAppServer({ store } = {}) {
  if (!store) throw new TypeError('createAppServer requires an initialized task repository');

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
      const path = url.pathname;

      if (request.method === 'GET' && path === '/health') {
        return sendJson(response, 200, { status: 'ok' });
      }

      if (path.startsWith('/api/')) {
        if (path === '/api/tasks') {
          if (request.method === 'GET') {
            return sendJson(response, 200, { tasks: filteredTasks(await store.list(), url.searchParams) });
          }
          if (request.method === 'POST') {
            const task = await store.create(await readJson(request));
            return sendJson(response, 201, { task }, taskVersionHeader(task));
          }
          return sendJson(response, 405, { error: 'Method not allowed' }, { allow: 'GET, POST' });
        }

        const taskRoute = path.match(/^\/api\/tasks\/([^/]+)$/);
        if (taskRoute) {
          const taskId = decodeURIComponent(taskRoute[1]);
          if (request.method === 'GET') {
            const task = await store.get(taskId);
            return task ? sendJson(response, 200, { task }, taskVersionHeader(task)) : sendJson(response, 404, { error: 'Task not found' });
          }
          if (request.method === 'PATCH') {
            const ifMatch = request.headers['if-match'];
            if (!ifMatch) return sendJson(response, 428, { error: 'If-Match is required. Reload the task before saving.' });
            const expectedUpdatedAt = ifMatch.startsWith('"') && ifMatch.endsWith('"') ? ifMatch.slice(1, -1) : ifMatch;
            const task = await store.update(taskId, await readJson(request), expectedUpdatedAt);
            return task ? sendJson(response, 200, { task }, taskVersionHeader(task)) : sendJson(response, 404, { error: 'Task not found' });
          }
          if (request.method === 'DELETE') {
            const task = await store.delete(taskId);
            return task ? sendJson(response, 200, { task }) : sendJson(response, 404, { error: 'Task not found' });
          }
          return sendJson(response, 405, { error: 'Method not allowed' }, { allow: 'GET, PATCH, DELETE' });
        }

        return sendJson(response, 404, { error: 'API route not found' });
      }

      if (request.method === 'GET' && await serveStatic(response, path)) return;
      if (path === '/' || path.startsWith('/assets/')) return sendJson(response, 404, { error: 'Page not found' });
      return sendJson(response, 404, { error: 'Route not found' });
    } catch (error) {
      if (error instanceof TaskValidationError) {
        return sendJson(response, 400, { error: error.message, field: error.field });
      }
      if (error instanceof TaskConflictError) {
        return sendJson(response, 412, { error: error.message, code: 'TASK_VERSION_CONFLICT' });
      }
      console.error('Request failed:', error);
      return sendJson(response, 500, { error: 'Internal server error' });
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.env.PORT ?? 3000);
  const dataFile = resolve(process.env.DATA_FILE ?? 'data/tasks.json');
  const repository = await new JsonTaskRepository(dataFile, sampleTasks).init();
  const server = createAppServer({ store: repository });
  server.listen(port, () => console.log(`Sprintboard listening at http://localhost:${port}`));
}