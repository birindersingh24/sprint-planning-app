import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTaskRecord, updateTaskRecord, validateTaskInput } from './tasks.js';

export class JsonTaskRepository {
  #tasks = new Map();
  #writeQueue = Promise.resolve();
  #writeFile;

  constructor(filePath, seedTasks = [], { writeFileFn = writeFile } = {}) {
    this.filePath = resolve(filePath);
    this.seedTasks = seedTasks;
    this.#writeFile = writeFileFn;
  }

  async init() {
    await mkdir(dirname(this.filePath), { recursive: true });

    let contents;
    try {
      contents = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const seeded = this.seedTasks.map((input) => createTaskRecord(input));
      this.#tasks = new Map(seeded.map((task) => [task.id, task]));
      await this.#persist(this.#tasks);
      return this;
    }

    try {
      const records = JSON.parse(contents);
      this.#validateRecords(records);
      this.#tasks = new Map(records.map((task) => [task.id, task]));
    } catch (error) {
      if (!(error instanceof SyntaxError) && error.name !== 'PersistedTaskDataError') throw error;
      await this.#recoverCorruptData(error);
    }
    return this;
  }

  async list() {
    await this.#writeQueue;
    return [...this.#tasks.values()].map((task) => ({ ...task }));
  }

  async get(id) {
    await this.#writeQueue;
    const task = this.#tasks.get(id);
    return task ? { ...task } : null;
  }

  create(input) {
    return this.#commit((tasks) => {
      const task = createTaskRecord(input);
      tasks.set(task.id, task);
      return { ...task };
    });
  }

  update(id, input) {
    return this.#commit((tasks) => {
      const current = tasks.get(id);
      if (!current) return null;
      const task = updateTaskRecord(current, input);
      tasks.set(id, task);
      return { ...task };
    });
  }

  delete(id) {
    return this.#commit((tasks) => {
      const task = tasks.get(id);
      if (!task) return null;
      tasks.delete(id);
      return { ...task };
    });
  }

  #commit(operation) {
    const pending = this.#writeQueue.then(async () => {
      const next = new Map([...this.#tasks].map(([id, task]) => [id, { ...task }]));
      const result = operation(next);
      await this.#persist(next);
      this.#tasks = next;
      return result;
    });
    this.#writeQueue = pending.catch(() => {});
    return pending;
  }

  #validateRecords(records) {
    if (!Array.isArray(records)) throw persistedDataError('The saved value must be an array.');
    const seenIds = new Set();
    for (const task of records) {
      if (!task || typeof task !== 'object' || Array.isArray(task)) {
        throw persistedDataError('Every saved task must be an object.');
      }
      const { id, createdAt, updatedAt, ...fields } = task;
      if (typeof id !== 'string' || !id || seenIds.has(id)) {
        throw persistedDataError('Every saved task must have a unique non-empty ID.');
      }
      if (!isValidTimestamp(createdAt) || !isValidTimestamp(updatedAt)) {
        throw persistedDataError(`Task ${id} has an invalid timestamp.`);
      }
      try {
        validateTaskInput(fields);
      } catch (error) {
        throw persistedDataError(`Task ${id} is invalid: ${error.message}`);
      }
      seenIds.add(id);
    }
  }

  async #recoverCorruptData(cause) {
    const quarantinePath = `${this.filePath}.corrupt-${Date.now()}-${process.pid}-${randomUUID()}`;
    await rename(this.filePath, quarantinePath);
    console.warn(`Sprintboard found invalid task data (${cause.message}). Original data preserved at ${quarantinePath}`);
    const seeded = this.seedTasks.map((input) => createTaskRecord(input));
    this.#tasks = new Map(seeded.map((task) => [task.id, task]));
    await this.#persist(this.#tasks);
  }

  async #persist(tasks) {
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await this.#writeFile(temporaryPath, `${JSON.stringify([...tasks.values()], null, 2)}\n`, 'utf8');
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
}

function persistedDataError(message) {
  const error = new Error(message);
  error.name = 'PersistedTaskDataError';
  return error;
}

function isValidTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}