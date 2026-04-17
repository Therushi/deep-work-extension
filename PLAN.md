# Deep Work Extension — Implementation Plan

## Overview

A Chromium-based browser extension (Chrome + Brave) to enforce focused work sessions using the Pomodoro Technique. Blocks distracting websites, shows motivational quotes on blocked pages, and tracks sessions locally.

---

## Decisions Locked In

| Question | Decision |
| --- | --- |
| Target browser | Chrome + Brave (both Chromium — single MV3 build works for both) |
| Breaks behavior | Blocked sites auto-unblock when break phase starts |
| Emergency unlock | Phrase-based friction unlock — user must type a confirmation phrase |
| Storage | `chrome.storage.local` only (no sync) |
| Blocked page extras | Motivational quotes (local JSON, no API) |
| Sounds | Not included |
| Profiles | Included in MVP (P1) |

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Extension Framework | Manifest V3 (Chromium) |
| UI | Vanilla TypeScript + HTML/CSS |
| Background Logic | Service Worker (MV3 requirement) |
| Storage | `chrome.storage.local` |
| Blocking | `chrome.declarativeNetRequest` (dynamic rules) |
| Notifications | `chrome.notifications` API |
| Build Tool | Vite + `vite-plugin-web-extension` |

> **Why no React/Angular?** Extension popups are tiny UIs. A full framework adds bundle size with no real benefit. TypeScript + modular vanilla files gives type safety without overhead.

---

## Project Structure

```text
deep-work-extension/
├── src/
│   ├── background/
│   │   ├── service-worker.ts    # Core orchestrator: timer, alarms, messages
│   │   ├── blocker.ts           # declarativeNetRequest rule manager
│   │   └── timer.ts             # Pomodoro state machine
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.ts             # Countdown, start/stop/skip, session count, task input
│   │   └── popup.css
│   ├── settings/
│   │   ├── settings.html
│   │   ├── settings.ts          # Block list, profiles, Pomodoro config, schedule
│   │   └── settings.css
│   ├── blocked/
│   │   ├── blocked.html         # Redirect target for blocked domains
│   │   ├── blocked.ts           # Countdown, quote, task label, emergency unlock
│   │   └── blocked.css
│   ├── shared/
│   │   ├── storage.ts           # Typed wrappers for chrome.storage.local
│   │   ├── types.ts             # Shared interfaces/enums
│   │   ├── constants.ts         # Default config values
│   │   └── quotes.json          # Local motivational quotes array
│   └── manifest.json
├── public/
│   └── icons/                   # 16, 48, 128px PNGs
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Core Components

### 1. Service Worker (`background/service-worker.ts`)

- Owns the Pomodoro state machine — single source of truth
- Uses `chrome.alarms` for reliable background timing (`setInterval` dies when SW goes idle)
- Listens for messages: `START`, `STOP`, `SKIP`, `EMERGENCY_UNLOCK`
- Broadcasts state updates to popup for live countdown rendering
- Calls `blocker.ts` to add/remove rules on phase transitions
- Fires `chrome.notifications` at phase boundaries
- Handles scheduled auto-start via `chrome.alarms` with day/time config

**Pomodoro State Machine:**

```text
IDLE → WORK → SHORT_BREAK → WORK → ... → LONG_BREAK → IDLE
                 ^                              |
                 └──────── cycle repeats ───────┘
```

**Break auto-unblock flow:**

- `WORK` ends → alarm fires → `blocker.removeAll()` → transition to `SHORT_BREAK` or `LONG_BREAK`
- Break ends → `blocker.applyRules(activeProfile.sites)` → transition back to `WORK`

### 2. Blocker (`background/blocker.ts`)

- `applyRules(sites: string[])` — creates one redirect rule per domain → `blocked.html`
- `removeAll()` — clears all dynamic rules (break start, stop, emergency unlock)
- Redirect URL carries query params: `blocked.html?site=twitter.com&remaining=1200`
- In **whitelist mode**: blocks `<all_urls>` and adds *allow* rules for permitted domains

### 3. Popup (`popup/popup.ts`)

- Phase badge (WORK / BREAK / IDLE), MM:SS countdown, cycle count (`2 / 4`)
- Buttons: **Start**, **Stop**, **Skip Phase**
- **Task label input** — shown before starting; persisted to storage and displayed on blocked page
- Active profile selector (dropdown of saved profiles)
- Gear icon → opens `settings.html` in a new tab

### 4. Settings Page (`settings/settings.ts`)

- **Block list + Profiles** — create/rename/delete named profiles; each has its own site list
- **Whitelist mode toggle** — per profile; flips blocking logic to allow-only
- **Pomodoro config** — work/short break/long break durations, cycles before long break
- **Scheduled auto-start** — pick days (Mon–Fri checkboxes) + start time; saved as alarm schedule
- **Notifications** toggle
- **Emergency unlock phrase** — user sets a custom phrase (default: `"I choose to break focus"`)
- **Stats dashboard** — today's Pomodoros, total focus minutes, current streak

### 5. Blocked Page (`blocked/blocked.ts`)

- Reads `?site=` and `?remaining=` from URL; polls `chrome.storage.local` every second for live countdown
- Shows: blocked site name, time until break, current task label ("You're working on: X")
- Displays a random quote from `quotes.json` on each load
- **Emergency Unlock** — shows a text input; user must type the configured phrase exactly to unlock
  - On match: sends `EMERGENCY_UNLOCK` to SW → `blocker.removeAll()` → state → `IDLE`
  - On mismatch: shakes the input, does nothing

---

## Data Model (`shared/types.ts`)

```typescript
interface AppSettings {
  activeProfileId: string;
  profiles: BlockProfile[];
  pomodoro: PomodoroConfig;
  notifications: boolean;
  emergencyUnlockPhrase: string;    // default: 'I choose to break focus'
  schedule: ScheduleConfig | null;
}

interface BlockProfile {
  id: string;
  name: string;                     // 'Work', 'Study', 'Social Detox'
  sites: string[];
  whitelistMode: boolean;           // false = block listed sites; true = block everything else
}

interface PomodoroConfig {
  workMinutes: number;              // default: 25
  shortBreakMinutes: number;        // default: 5
  longBreakMinutes: number;         // default: 15
  cyclesBeforeLongBreak: number;    // default: 4
  autoStartNext: boolean;           // auto-advance phases without clicking
}

type Phase = 'idle' | 'work' | 'shortBreak' | 'longBreak';

interface SessionState {
  phase: Phase;
  cycleCount: number;
  endTimestamp: number;             // epoch ms — survives SW restart
  taskLabel: string;                // current session task
  todayDate: string;                // 'YYYY-MM-DD' — used to reset daily counter
  completedToday: number;
}

interface DailyStats {
  date: string;                     // 'YYYY-MM-DD'
  completedPomodoros: number;
  totalFocusMinutes: number;
}

interface ScheduleConfig {
  days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
  startTime: string;                // 'HH:MM' 24h format
}
```

---

## Feature List

### P1 — MVP

- [x] Start/stop focus mode with task label input
- [x] Pomodoro cycle: Work → Short Break → Long Break → repeat
- [x] Auto-unblock sites when break phase starts
- [x] Block list management with named **profiles** (create/rename/delete)
- [x] **Whitelist mode** toggle per profile
- [x] Custom blocked page with live countdown + task label + motivational quote
- [x] **Emergency unlock with phrase** (user-configurable phrase, must type exact match)
- [x] Desktop notifications on phase transitions
- [x] Persistent timer state across browser restarts
- [x] Configurable Pomodoro durations in settings

### P2 — UX Polish

- [ ] **Daily streak tracker** — consecutive days with ≥1 completed Pomodoro
- [ ] **Session stats dashboard** — today's Pomodoros, total focus minutes (in settings)
- [ ] Skip Phase button in popup
- [ ] Auto-start next phase toggle (no click between phases)
- [ ] **Scheduled auto-start** — pick days + time; fires via `chrome.alarms`

### P3 — Nice-to-Have

- [ ] Weekly stats chart (SVG, no library)
- [ ] Export session history as CSV
- [ ] Keyboard shortcut to start/stop from any tab

---

## Blocked Page — Quote Rotation

`quotes.json` bundled locally — no network dependency.

```json
[
  { "text": "Focus is the art of knowing what to ignore.", "author": "James Clear" },
  { "text": "Deep work is the superpower of the 21st century.", "author": "Cal Newport" },
  { "text": "The successful warrior is the average person with laser-like focus.", "author": "Bruce Lee" }
]
```

Random quote picked per page load via `Math.random()`.

---

## Build & Dev Setup

```bash
# Install deps
npm create vite@latest . -- --template vanilla-ts
npm install -D vite-plugin-web-extension @types/chrome

# Dev (auto-reloads extension on save)
npm run dev
# Load unpacked: chrome://extensions → Load unpacked → select dist/

# Production build
npm run build
```

---

## Phased Delivery

| Phase | Scope |
| --- | --- |
| **P1 — MVP** | Timer, profiles, whitelist mode, blocking/unblocking, popup with task label, blocked page with quote + phrase unlock, notifications |
| **P2 — UX** | Daily streak, session stats, skip phase, auto-start, scheduled start |
| **P3 — Power** | Weekly chart, CSV export, keyboard shortcuts |
