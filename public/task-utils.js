const priorityRank = { high: 0, medium: 1, low: 2 };

export function getAgendaGroup(task, today) {
  if (task.status === 'done') return 'completed';
  if (!task.dueDate) return 'unscheduled';
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
}

export function sortAgendaTasks(tasks, direction = 'asc') {
  const multiplier = direction === 'desc' ? -1 : 1;
  return [...tasks].sort((left, right) => {
    if (left.dueDate && !right.dueDate) return -1;
    if (!left.dueDate && right.dueDate) return 1;
    if (left.dueDate && right.dueDate && left.dueDate !== right.dueDate) {
      return left.dueDate.localeCompare(right.dueDate) * multiplier;
    }

    const priorityDifference = (priorityRank[left.priority] ?? 1) - (priorityRank[right.priority] ?? 1);
    return priorityDifference || left.title.localeCompare(right.title);
  });
}