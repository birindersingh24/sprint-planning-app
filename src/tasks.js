import { randomUUID } from 'node:crypto';

export const TASK_STATUSES = ['todo', 'in_progress', 'done'];
export const TASK_PRIORITIES = ['low', 'medium', 'high'];

const allowedFields = new Set(['title', 'description', 'status', 'priority', 'dueDate', 'assignee', 'label']);

export class TaskValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'TaskValidationError';
    this.field = field;
  }
}

export function validateTaskInput(input, { partial = false } = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TaskValidationError('Request body must be a JSON object', 'body');
  }

  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) {
      throw new TaskValidationError(`Unknown field: ${field}`, field);
    }
  }

  if (!partial || Object.hasOwn(input, 'title')) {
    if (typeof input.title !== 'string' || input.title.trim().length === 0 || input.title.trim().length > 120) {
      throw new TaskValidationError('Title must contain 1 to 120 characters', 'title');
    }
  }

  if (Object.hasOwn(input, 'description') && (typeof input.description !== 'string' || input.description.length > 2000)) {
    throw new TaskValidationError('Description must be a string of at most 2000 characters', 'description');
  }

  if (Object.hasOwn(input, 'status') && !TASK_STATUSES.includes(input.status)) {
    throw new TaskValidationError(`Status must be one of: ${TASK_STATUSES.join(', ')}`, 'status');
  }

  if (Object.hasOwn(input, 'priority') && !TASK_PRIORITIES.includes(input.priority)) {
    throw new TaskValidationError(`Priority must be one of: ${TASK_PRIORITIES.join(', ')}`, 'priority');
  }

  if (Object.hasOwn(input, 'dueDate') && input.dueDate !== null && !isCalendarDate(input.dueDate)) {
    throw new TaskValidationError('Due date must be a valid YYYY-MM-DD date or null', 'dueDate');
  }

  for (const field of ['assignee', 'label']) {
    const maximumLength = field === 'assignee' ? 60 : 32;
    if (Object.hasOwn(input, field) && (typeof input[field] !== 'string' || input[field].trim().length > maximumLength)) {
      throw new TaskValidationError(`${field} must be a string of at most ${maximumLength} characters`, field);
    }
  }
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function createTaskRecord(input, id = randomUUID(), now = new Date().toISOString()) {
  validateTaskInput(input);
  return {
    id,
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    status: input.status ?? 'todo',
    priority: input.priority ?? 'medium',
    dueDate: input.dueDate ?? null,
    assignee: input.assignee?.trim() || 'Unassigned',
    label: input.label?.trim() || 'General',
    createdAt: now,
    updatedAt: now,
  };
}

export function updateTaskRecord(current, input, now = new Date().toISOString()) {
  validateTaskInput(input, { partial: true });
  if (Object.keys(input).length === 0) {
    throw new TaskValidationError('At least one task field is required', 'body');
  }

  const updatedAt = new Date(Math.max(Date.parse(now), Date.parse(current.updatedAt) + 1)).toISOString();
  return {
    ...current,
    ...input,
    ...(Object.hasOwn(input, 'title') ? { title: input.title.trim() } : {}),
    ...(Object.hasOwn(input, 'description') ? { description: input.description.trim() } : {}),
    ...(Object.hasOwn(input, 'assignee') ? { assignee: input.assignee.trim() || 'Unassigned' } : {}),
    ...(Object.hasOwn(input, 'label') ? { label: input.label.trim() || 'General' } : {}),
    updatedAt,
  };
}

export class TaskStore {
  #tasks = new Map();

  list() {
    return [...this.#tasks.values()].map((task) => ({ ...task }));
  }

  get(id) {
    const task = this.#tasks.get(id);
    return task ? { ...task } : null;
  }

  create(input) {
    const task = createTaskRecord(input);
    this.#tasks.set(task.id, task);
    return { ...task };
  }

  update(id, input) {
    const current = this.#tasks.get(id);
    if (!current) return null;
    const updated = updateTaskRecord(current, input);
    this.#tasks.set(id, updated);
    return { ...updated };
  }

  delete(id) {
    const task = this.#tasks.get(id);
    if (!task) return null;
    this.#tasks.delete(id);
    return { ...task };
  }
}