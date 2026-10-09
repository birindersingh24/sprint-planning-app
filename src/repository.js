import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTaskRecord, updateTaskRecord } from './tasks.js';

export class JsonTaskRepository {
  #tasks = new Map();
  #writeQueue = Promise.resolve();

  constructor(filePath, seedTasks = []) {
    this.filePath = resolve(filePath);
    this.seedTasks = seedTasks;
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

    const records = JSON.parse(contents);
    if (!Array.isArray(records) || records.some((task) => !task || typeof task.id !== 'string' || typeof task.title !== 'string')) {
      throw new Error(`Task data at ${this.filePath} has an invalid format`);
    }
    this.#tasks = new Map(records.map((task) => [task.id, task]));
    if (this.#tasks.size !== records.length) throw new Error(`Task data at ${this.filePath} contains duplicate IDs`);
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

  async #persist(tasks) {
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify([...tasks.values()], null, 2)}\n`, 'utf8');
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
}