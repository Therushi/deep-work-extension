# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server with hot-reload (load dist/ as unpacked extension)
npm run build    # Production build → dist/
npm run preview  # Preview production build
```

No lint or test scripts are configured yet.

After any build, reload the extension in `chrome://extensions` (toggle the reload button on the unpacked extension) to pick up changes.

## Architecture

**Chrome MV3 extension** — Pomodoro focus timer that blocks distracting websites during work sessions.

### Entry Points

| Page | HTML | Script |
|------|------|--------|
| Popup | `src/popup/popup.html` | `src/popup/popup.ts` |
| Settings | `src/settings/settings.html` | `src/settings/settings.ts` |
| Blocked redirect | `src/blocked/blocked.html` | `src/blocked/blocked.ts` |
| Service worker | — | `src/background/service-worker.ts` |

### State Machine

`service-worker.ts` is the single source of truth. Phases:

```
IDLE → WORK (25 min) → SHORT_BREAK (5 min) → WORK → ... (×4 cycles) → LONG_BREAK (15 min) → WORK → IDLE
```

Timing uses `chrome.alarms` (survives SW idle). Every second the SW writes `_tick` to storage so the blocked page can poll for a live countdown without a persistent connection.

On browser restart: SW reads persisted `session` state and re-arms the alarm + blocking rules so sessions survive restarts.

### Blocking

`src/background/blocker.ts` manages `chrome.declarativeNetRequest` rules:
- **Block mode** (default): each blocked domain gets a redirect rule → `blocked.html?site=<domain>`
- **Whitelist mode**: blocks `<all_urls>`, then adds allow rules for whitelisted sites

Rules are applied on `WORK` start and removed on break/stop.

### Messaging

UI pages send typed `ExtMessage` objects to the SW; SW broadcasts `STATE_UPDATE` back to all listeners.

Message types: `START | STOP | SKIP | EMERGENCY_UNLOCK | GET_STATE | STATE_UPDATE`

### Persistence (`chrome.storage.local`)

| Key | Type | Content |
|-----|------|---------|
| `settings` | `AppSettings` | Profiles, Pomodoro durations, emergency phrase, schedule, notifications |
| `session` | `SessionState` | Current phase, cycle count, end timestamp, task label |
| `stats` | `DailyStats[]` | Per-day completed Pomodoros + focus minutes (last 30 days) |

All storage access goes through typed wrappers in `src/shared/storage.ts`.

### Key Shared Files

- `src/shared/types.ts` — all TypeScript interfaces (`SessionState`, `AppSettings`, `BlockProfile`, `Phase`, `ExtMessage`, etc.)
- `src/shared/constants.ts` — default settings, alarm names, storage keys
- `src/shared/quotes.json` — motivational quotes shown on the blocked page

### Build

Vite + `vite-plugin-web-extension` targeting Chromium MV3. `src/manifest.json` is the extension manifest source. `blocked.html` must be listed as an additional input in `vite.config.ts` because it is not referenced from the manifest directly.

Icons live in `public/icons/` (16/48/128 px PNGs) and can be regenerated with `node scripts/generate-icons.mjs`.
