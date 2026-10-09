const statuses = ['todo', 'in_progress', 'done'];
const statusLabels = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
const elements = {
  search: document.querySelector('#search-input'),
  priority: document.querySelector('#priority-filter'),
  assignee: document.querySelector('#assignee-filter'),
  dialog: document.querySelector('#task-dialog'),
  form: document.querySelector('#task-form'),
  formError: document.querySelector('#form-error'),
  toast: document.querySelector('#toast'),
};

let tasks = [];
const knownAssignees = new Set();
let searchTimer;
let toastTimer;
let loadSequence = 0;

function escapePathSegment(value) {
  return encodeURIComponent(value);
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { 'content-type': 'application/json', ...options.headers } : options.headers,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload;
}

function currentFilters() {
  const parameters = new URLSearchParams();
  const query = elements.search.value.trim();
  if (query) parameters.set('q', query);
  if (elements.priority.value) parameters.set('priority', elements.priority.value);
  if (elements.assignee.value) parameters.set('assignee', elements.assignee.value);
  return parameters.toString();
}

async function loadTasks() {
  const sequence = ++loadSequence;
  const query = currentFilters();
  try {
    const { tasks: result } = await requestJson(`/api/tasks${query ? `?${query}` : ''}`);
    if (sequence !== loadSequence) return;
    tasks = result;
    renderBoard();
    updateAssigneeOptions();
  } catch (error) {
    showToast(`Couldn't load tasks: ${error.message}`);
  }
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatDueDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function isOverdue(value) {
  if (!value) return false;
  const today = new Date();
  const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  return value < todayKey;
}

function createTaskCard(task, index) {
  const card = createElement('article', 'task-card');
  card.draggable = true;
  card.dataset.id = task.id;
  card.style.animationDelay = `${Math.min(index, 6) * 25}ms`;
  card.setAttribute('aria-label', `${task.title}, ${statusLabels[task.status]}, ${task.priority} priority`);

  const top = createElement('div', 'task-card-top');
  top.append(createElement('span', 'task-label', task.label));
  const menuButton = createElement('button', 'task-menu', '···');
  menuButton.type = 'button';
  menuButton.title = 'Edit task';
  menuButton.setAttribute('aria-label', `Edit ${task.title}`);
  menuButton.addEventListener('click', () => openTaskDialog(task));
  top.append(menuButton);

  const title = createElement('h3', 'task-title', task.title);
  const description = createElement('p', 'task-description', task.description || 'No description');
  const meta = createElement('div', 'task-meta');
  const leftMeta = createElement('div', 'task-meta-left');
  leftMeta.append(createElement('span', `priority priority-${task.priority}`, task.priority[0].toUpperCase() + task.priority.slice(1)));
  if (task.dueDate) {
    leftMeta.append(createElement('span', `task-due${isOverdue(task.dueDate) && task.status !== 'done' ? ' overdue' : ''}`, formatDueDate(task.dueDate)));
  }
  meta.append(leftMeta, createElement('span', 'task-assignee', task.assignee));
  card.append(top, title, description, meta);

  card.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', task.id);
    event.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  return card;
}

function renderBoard() {
  const grouped = Object.fromEntries(statuses.map((status) => [status, tasks.filter((task) => task.status === status)]));
  for (const status of statuses) {
    const list = document.querySelector(`[data-list="${status}"]`);
    list.replaceChildren();
    document.querySelector(`[data-count="${status}"]`).textContent = grouped[status].length;
    if (grouped[status].length === 0) {
      list.append(createElement('div', 'empty-column', 'Nothing here yet'));
    } else {
      grouped[status].forEach((task, index) => list.append(createTaskCard(task, index)));
    }
  }

  const allCount = tasks.length;
  const doneCount = grouped.done.length;
  const progress = allCount === 0 ? 0 : Math.round((doneCount / allCount) * 100);
  document.querySelector('#summary-task-count').replaceChildren(document.createTextNode(`${allCount} `), createElement('small', '', 'total'));
  document.querySelector('#summary-done-count').replaceChildren(document.createTextNode(`${doneCount} `), createElement('small', '', 'tasks'));
  document.querySelector('#nav-task-count').textContent = allCount;
  document.querySelector('#progress-label').textContent = `${progress}%`;
  document.querySelector('#progress-fill').style.width = `${progress}%`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = tasks.filter((task) => {
    if (!task.dueDate || task.status === 'done') return false;
    const [year, month, day] = task.dueDate.split('-').map(Number);
    const dueDate = new Date(year, month - 1, day);
    const daysUntilDue = Math.floor((dueDate - today) / 86400000);
    return daysUntilDue >= 0 && daysUntilDue <= 3;
  }).length;
  document.querySelector('#due-count').textContent = `${upcoming} due soon`;
}

function updateAssigneeOptions() {
  const selected = elements.assignee.value;
  tasks.map((task) => task.assignee).filter(Boolean).forEach((name) => knownAssignees.add(name));
  const names = [...knownAssignees].sort((a, b) => a.localeCompare(b));
  elements.assignee.replaceChildren(new Option('Assignee', ''));
  for (const name of names) elements.assignee.add(new Option(name, name));
  if (names.includes(selected)) elements.assignee.value = selected;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 2800);
}

function openTaskDialog(task = null, initialStatus = 'todo') {
  elements.form.reset();
  elements.formError.hidden = true;
  document.querySelector('#task-id').value = task?.id ?? '';
  document.querySelector('#task-title').value = task?.title ?? '';
  document.querySelector('#task-description').value = task?.description ?? '';
  document.querySelector('#task-status').value = task?.status ?? initialStatus;
  document.querySelector('#task-priority').value = task?.priority ?? 'medium';
  document.querySelector('#task-assignee').value = task?.assignee === 'Unassigned' ? '' : task?.assignee ?? '';
  document.querySelector('#task-due-date').value = task?.dueDate ?? '';
  document.querySelector('#task-label').value = task?.label === 'General' ? '' : task?.label ?? '';
  document.querySelector('#dialog-title').textContent = task ? 'Edit task' : 'Create task';
  document.querySelector('#save-task').textContent = task ? 'Save changes' : 'Create task';
  document.querySelector('#delete-task').hidden = !task;
  elements.dialog.showModal();
  document.querySelector('#task-title').focus();
}

function closeTaskDialog() {
  elements.dialog.close();
}

async function saveTask(event) {
  event.preventDefault();
  const id = document.querySelector('#task-id').value;
  const payload = {
    title: document.querySelector('#task-title').value,
    description: document.querySelector('#task-description').value,
    status: document.querySelector('#task-status').value,
    priority: document.querySelector('#task-priority').value,
    assignee: document.querySelector('#task-assignee').value,
    dueDate: document.querySelector('#task-due-date').value || null,
    label: document.querySelector('#task-label').value,
  };

  try {
    await requestJson(id ? `/api/tasks/${escapePathSegment(id)}` : '/api/tasks', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    closeTaskDialog();
    await loadTasks();
    showToast(id ? 'Task updated' : 'Task created');
  } catch (error) {
    elements.formError.textContent = error.message;
    elements.formError.hidden = false;
  }
}

async function deleteTask() {
  const id = document.querySelector('#task-id').value;
  if (!id || !window.confirm('Delete this task? This cannot be undone.')) return;
  try {
    await requestJson(`/api/tasks/${escapePathSegment(id)}`, { method: 'DELETE' });
    closeTaskDialog();
    await loadTasks();
    showToast('Task deleted');
  } catch (error) {
    elements.formError.textContent = error.message;
    elements.formError.hidden = false;
  }
}

async function moveTask(id, status) {
  const task = tasks.find((item) => item.id === id);
  if (!task || task.status === status) return;
  try {
    await requestJson(`/api/tasks/${escapePathSegment(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await loadTasks();
    showToast(`Moved to ${statusLabels[status]}`);
  } catch (error) {
    showToast(`Couldn't move task: ${error.message}`);
  }
}

document.querySelector('#new-task-button').addEventListener('click', () => openTaskDialog());
document.querySelectorAll('.add-task-link, .add-column-task').forEach((button) => {
  button.addEventListener('click', () => openTaskDialog(null, button.dataset.status));
});
document.querySelector('#close-dialog').addEventListener('click', closeTaskDialog);
document.querySelector('#cancel-dialog').addEventListener('click', closeTaskDialog);
document.querySelector('#delete-task').addEventListener('click', deleteTask);
elements.form.addEventListener('submit', saveTask);
elements.priority.addEventListener('change', loadTasks);
elements.assignee.addEventListener('change', loadTasks);
elements.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadTasks, 180);
});
document.querySelector('#clear-filters').addEventListener('click', () => {
  elements.search.value = '';
  elements.priority.value = '';
  elements.assignee.value = '';
  loadTasks();
});
document.querySelector('#theme-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark-theme');
  try {
    localStorage.setItem('sprintboard-theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
  } catch {
    showToast('Theme changed for this session');
  }
});

for (const column of document.querySelectorAll('.kanban-column')) {
  column.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    column.classList.add('drag-over');
  });
  column.addEventListener('dragleave', (event) => {
    if (!column.contains(event.relatedTarget)) column.classList.remove('drag-over');
  });
  column.addEventListener('drop', (event) => {
    event.preventDefault();
    column.classList.remove('drag-over');
    moveTask(event.dataTransfer.getData('text/plain'), column.dataset.status);
  });
}

try {
  if (localStorage.getItem('sprintboard-theme') === 'dark') document.body.classList.add('dark-theme');
} catch {
  // Storage can be unavailable in restricted browser contexts.
}
loadTasks();