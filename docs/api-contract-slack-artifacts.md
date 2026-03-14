# API Contract: Media Artifacts & Slack Integration

## Overview

This document defines the API contract between the Mission Control frontend and the backend for media artifact support and Slack lifecycle notifications on coding tasks.

---

## 1. Task Object — New Fields

The following optional fields are added to the `Task` object returned by `GET /api/tasks` and `GET /api/tasks/{id}`:

```json
{
  "slack_channel": "C06ABC123",
  "slack_thread_ts": "1710400000.000100",
  "last_notified_phase": "human_review",
  "slack_thread_url": "https://workspace.slack.com/archives/C06ABC123/p1710400000000100"
}
```

| Field               | Type     | Description |
|---------------------|----------|-------------|
| `slack_channel`     | `string` | Slack channel ID where the thread lives |
| `slack_thread_ts`   | `string` | Slack thread timestamp (parent message) |
| `last_notified_phase` | `TaskStatus` | Last phase that triggered a Slack notification |
| `slack_thread_url`  | `string` | Direct URL to the Slack thread |

All fields are optional. The frontend renders a Slack thread link when `slack_thread_url` is present.

---

## 2. TaskArtifact Object — Extended Fields

Artifacts are returned inside `TaskEvents` from `GET /api/tasks/{id}/events`.

```json
{
  "kind": "screenshot",
  "type": "image",
  "title": "Plan phase screenshot",
  "content": "Agent completed initial planning",
  "url": "/api/tasks/task-016/artifacts/screenshot-001.png",
  "mime_type": "image/png",
  "thumbnail_url": "/api/tasks/task-016/artifacts/screenshot-001-thumb.png",
  "phase": "in_progress",
  "source": "browser",
  "slack_file_id": "F06XYZ789",
  "slack_ts": "1710400100.000200",
  "created_at": "2026-03-14T10:00:00Z"
}
```

| Field           | Type     | Required | Description |
|-----------------|----------|----------|-------------|
| `kind`          | `string` | yes | `plan`, `report`, `deliverable`, `screenshot`, `video_clip`, `reference` |
| `type`          | `string` | no  | `text` (default), `image`, `video`, `link` |
| `title`         | `string` | yes | Display title |
| `content`       | `string` | yes | Text content, caption, or markdown body |
| `url`           | `string` | no  | Media URL or link target |
| `mime_type`     | `string` | no  | MIME type for media (e.g. `image/png`, `video/mp4`) |
| `thumbnail_url` | `string` | no  | Thumbnail URL for preview |
| `phase`         | `TaskStatus` | no | Which task phase produced this artifact |
| `source`        | `string` | no  | Origin: `browser`, `terminal`, `agent` |
| `slack_file_id` | `string` | no  | Slack file ID if uploaded to Slack |
| `slack_ts`      | `string` | no  | Slack message timestamp if posted |
| `created_at`    | `string` | yes | ISO 8601 timestamp |

### Backward compatibility

- Existing text-only artifacts (with only `kind`, `title`, `content`, `created_at`) continue to work unchanged
- When `type` is absent, the frontend defaults to `text` rendering

---

## 3. Slack Notification Triggers

The backend should post to the Slack thread **only on phase transitions**, not on every log line.

### Recommended trigger points

| Phase Transition | Action |
|-----------------|--------|
| Task created (→ `backlog`/`todo`) | Create Slack thread with task title, ID, and link |
| → `in_progress` | Post update: agent started, link to MC task |
| → `human_review` | Post update + screenshot + optional video clip |
| → `blocked` | Post update + blocked reason + screenshot |
| → `merging` | Post update: PR link |
| → `done` | Post update + final screenshot/video |

### Slack message format

Each update should include:
- Task title + ID
- Current phase
- 1-2 sentence summary
- Screenshot (if available, uploaded as Slack file)
- Optional short video clip (for `human_review`, `blocked`, `done`)
- Link back to Mission Control task detail

---

## 4. Media Capture Recommendations

### Screenshots
- Capture on each meaningful phase transition
- Prefer browser/companion UI screenshot when a browser session is active
- Fall back to terminal state screenshot

### Video clips
- Short clips (10-30s) only for review checkpoints: `human_review`, `blocked`, `done`
- Do NOT record full sessions in v1

### Storage
- Serve artifacts via the existing task API path: `/api/tasks/{id}/artifacts/{filename}`
- Store files on disk alongside task data
- Mission Control task remains the source of truth — Slack is a notification channel

---

## 5. Channel/Thread Strategy

**Recommended approach:**
- One Slack channel per project (e.g., `#mc-project-name`)
- One thread per task within that channel
- Backend stores `slack_channel` and `slack_thread_ts` on the task object
- If no channel is configured for a project, skip Slack notifications silently
