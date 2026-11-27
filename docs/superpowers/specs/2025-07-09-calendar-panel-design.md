# Dynamic Island Calendar Panel Design

> Historical upstream design record, translated for the fork. Its code excerpts, paths, defaults and implementation steps are not current instructions; use the Agent Creation work protocol and live source instead.

## Overview

Add a fourth panel to Dynamic Island: the calendar panel. Tasks can be associated with a specific day and time (or all day). During the scheduled interval, Dynamic Island automatically expands to quick mode to show the task and a completion button.

## Data model

### Task structure extension

Current task structure (`island-app.js`):
```js
{ id, text, done, due_time, source, notified, created_at }
```

Extended structure:
```js
{
  id: string,
  text: string,
  done: boolean,
  due_time: string | null,   // ISO format, reminder start time
  end_time: string | null,   // ISO format, expiration time, defaults to due_time + 1h
  all_day: boolean,          // Whether this is an all-day event
  source: string,            // 'user' | 'ai'
  notified: boolean,
  created_at: number
}
```

Storage: `localStorage` key `island_tasks`; Tasks and Calendar panels share the same data source.

## Panel architecture

Dynamic Island expands from three panels to four:
- Panel 0: Weather/time
- Panel 1: Music
- Panel 2: Task list
- Panel 3: **Calendar** (new)

Panel switching logic (swipe, wheel, dot indicator) must be updated to support four panels.

## Calendar panel UI (Panel 3)

### Layout (event list and mini calendar header)

```
┌─────────────────────────────────┐
│  ◀  Jul 7 - Jul 13  ▶     📅   │  ← Week selector + month button
│  Mo Tu We Th Fr Sa Su           │  ← Weekday headers
│  7   8  [9] 10  11  12  13     │  ← Date row, today highlighted
├─────────────────────────────────┤
│  📋 Jul 9, Wednesday           │  ← Selected-day heading
│                                 │
│  ⬜ All day · Project report ✓ ✕ │  ← All-day task
│  ⬜ 14:30 · Team standup     ✓ ✕ │  ← Timed task
│  ⬜ 16:00 · Submit code      ✓ ✕ │
│                                 │
├─────────────────────────────────┤
│  + Add event...                │  ← Add area
│     ⏰ Select time [All day] [Add] │
└─────────────────────────────────┘
```

### Interaction details

1. **Week selector**: `◀ ▶` arrows switch weeks and show the current range (e.g. "Jul 7 - Jul 13").
2. **Date row**: show seven days of the current week. Dates with tasks have a small green dot. Click to select a date; today is highlighted in blue.
3. **Month calendar popup**: click the upper-right 📅 to open a mini month grid and jump to any date.
4. **Selected-day task list**: scrollable area; each row contains a checkbox, time/all-day label, task text, ✓ complete and ✕ delete.
5. **Add area**: input, time selector (opens a simple picker for a specific time or all-day event), and Add button.

### Mini Month Picker

Click 📅 to open:
- Full calendar grid for the current or selected month.
- Small green dots on dates with tasks.
- Click any date to close the popup and jump to that day.
- Left/right arrows switch months.

## Quick-mode reminders

### Trigger conditions

`checkTaskReminders()` polls every 30 seconds. Trigger when `due_time <= now < end_time` and `task.done === false`.

### Behavior

- Dynamic Island remains in `still` mode but switches to the reminder display.
- Island width automatically adjusts to **310px** (quick-mode width).
- Display: ⏰ icon, task text, and **[Done]** button.
- **Persistent display**, without automatic dismissal.
- Press [Done] → `task.done = true`; reminder disappears and island returns to normal still mode.

```
┌──────────────────────────────────────┐
│  ⏰  Submit code              [Done]  │
└──────────────────────────────────────┘
```

### Expiration handling

- Default `end_time = due_time + 1 hour`.
- When `now >= end_time`, reminder disappears, `notified` resets, and island returns to normal.
- User can set `end_time` manually in the calendar panel.

### Concurrent tasks

If several tasks become due at once, display the earliest one. When completed, automatically display the next. If the current reminder is dismissed (click outside task text area), expand to large mode at the calendar panel to view all due tasks.

## MCP tool changes

### Modify existing tool

Extend `island_task_create` parameters:
- `text` (required)
- `due_time` (optional, ISO)
- `end_time` (optional, ISO, defaults to due_time + 1h)
- `all_day` (optional, boolean)

### New tools

| Tool name | Parameters | Description |
|--------|------|------|
| `island_calendar_list` | `date` (optional, ISO date) | List all tasks for the specified date |
| `island_calendar_month` | `year`, `month` | Return task counts per day of the specified month for calendar markers |

## Affected files

| File | Changes |
|------|---------|
| `static/island.html` | Add Panel 3 HTML template, fourth indicator dot and persistent quick-mode reminder |
| `static/island-app.js` | Extend data model (end_time, all_day), add calendar computed properties/methods, update swipe/panel logic and checkTaskReminders, register new MCP tools |
| `static/css/island.css` | Add calendar panel, month popup and persistent quick-mode reminder styles |

## Out of scope

- No changes to `main.js` (Electron window creation unchanged).
- No changes to `py/dynamic_island.py` (backend tool registration unchanged; handled by frontend).
- No changes to `server.py`.
- No changes to Tasks panel UI (only shared data).
