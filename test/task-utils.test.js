import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgendaGroup, sortAgendaTasks } from '../public/task-utils.js';

const today = '2026-10-09';

test('classifies agenda tasks by due date and completion state', () => {
  assert.equal(getAgendaGroup({ status: 'todo', dueDate: '2026-10-08' }, today), 'overdue');
  assert.equal(getAgendaGroup({ status: 'in_progress', dueDate: today }, today), 'today');
  assert.equal(getAgendaGroup({ status: 'todo', dueDate: '2026-10-10' }, today), 'upcoming');
  assert.equal(getAgendaGroup({ status: 'todo', dueDate: null }, today), 'unscheduled');
  assert.equal(getAgendaGroup({ status: 'done', dueDate: '2026-10-01' }, today), 'completed');
});

test('sorts by due date in either direction with undated tasks last', () => {
  const tasks = [
    { title: 'No date', dueDate: null, priority: 'high' },
    { title: 'Later', dueDate: '2026-10-12', priority: 'low' },
    { title: 'Sooner', dueDate: '2026-10-10', priority: 'medium' },
  ];

  assert.deepEqual(sortAgendaTasks(tasks).map((task) => task.title), ['Sooner', 'Later', 'No date']);
  assert.deepEqual(sortAgendaTasks(tasks, 'desc').map((task) => task.title), ['Later', 'Sooner', 'No date']);
  assert.deepEqual(tasks.map((task) => task.title), ['No date', 'Later', 'Sooner']);
});

test('uses priority and title for stable ordering when due dates match', () => {
  const tasks = [
    { title: 'Medium item', dueDate: today, priority: 'medium' },
    { title: 'Zebra', dueDate: today, priority: 'high' },
    { title: 'Apple', dueDate: today, priority: 'high' },
  ];

  assert.deepEqual(sortAgendaTasks(tasks).map((task) => task.title), ['Apple', 'Zebra', 'Medium item']);
});