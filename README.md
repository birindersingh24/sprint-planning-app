# Sprintboard Review Lab

A small full-stack sprint board for evaluating Codzee's GitHub pull-request reviews. Sprintboard includes a responsive Kanban UI, a task API, validation, search and filters, drag-and-drop status updates, and atomic JSON-file persistence. The example is intentionally dependency-free and is a learning project, not a production service.

## Requirements

- Node.js 20 or newer

## Run it locally

```sh
npm start
```

Open `http://localhost:3000`. The app seeds example tasks into `data/tasks.json` on first launch and keeps changes across restarts. Set `PORT` to use another port, or `DATA_FILE` to choose a different data file.

## Test it

```sh
npm test
```

## Features

- Three-column sprint board with drag-and-drop status changes, plus a due-date Agenda view.
- Create, edit, and delete tasks with title, description, priority, due date, assignee, and label.
- Search task title, description, and label; filter by priority and assignee.
- Sprint progress, completion count, and due-soon summary.
- Light and dark themes, with theme preference saved in browser storage.
- JSON API with validation, 64 KB body limit, method handling, and structured errors.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/health` | Check service status |
| `GET` | `/api/tasks` | List tasks; optional `q`, `priority`, `assignee`, and `status` filters |
| `POST` | `/api/tasks` | Create a task |
| `GET` | `/api/tasks/:id` | Get a task |
| `PATCH` | `/api/tasks/:id` | Update supplied task fields |
| `DELETE` | `/api/tasks/:id` | Delete a task |

Task fields are `title` (required, 1-120 characters), `description` (up to 2,000 characters), `status` (`todo`, `in_progress`, or `done`), `priority` (`low`, `medium`, or `high`), `dueDate` (a valid `YYYY-MM-DD` date or `null`), `assignee` (up to 60 characters), and `label` (up to 32 characters).

Example:

```sh
curl -X POST http://localhost:3000/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"Review the first Codzee PR","priority":"high","dueDate":"2026-10-12"}'
```

## Suggested review exercises

Connect Codzee to this public repository, then implement each exercise on a separate branch and open a separate pull request. Run `npm test` before each PR.

1. **Feature (implemented on `feature/due-date-agenda`):** Add due-date sorting and a calendar/agenda view, including accessible sorting controls and tests for missing and past dates.
2. **Bug fix:** Add optimistic concurrency using an `updatedAt` precondition so two browser sessions cannot silently overwrite each other's edits. Cover stale and current updates at the API level.
3. **Hardening:** Validate and recover from malformed persisted data without overwriting the original file; add a clear startup diagnostic and tests for corrupt, truncated, and structurally invalid records.

These exercises cover UI behavior, API contracts, and filesystem/data-integrity handling. For each PR, compare Codzee's findings with the tests and your own review. Record useful comments, false positives, missed issues, review latency, and confusing workflow steps. Verify findings yourself; do not treat generated reviews as authoritative.

## Publish for evaluation

Create a public empty GitHub repository, then connect this local repository:

```sh
git add .
git commit -m "Build Sprintboard evaluation starter"
git remote add origin https://github.com/YOUR-USERNAME/sprintboard-review-lab.git
git push -u origin main
```

Install Codzee on that repository before opening the exercise PRs. Keep `data/tasks.json` out of commits; it is local runtime state.