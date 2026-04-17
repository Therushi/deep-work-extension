// src/settings/settings.ts
import type { AppSettings, BlockProfile, Day } from "../shared/types.js";
import { storage } from "../shared/storage.js";
import { DEFAULT_SETTINGS } from "../shared/constants.js";

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const profilesList = document.getElementById("profilesList") as HTMLElement;
const addProfileBtn = document.getElementById(
  "addProfileBtn",
) as HTMLButtonElement;
const profileEditor = document.getElementById("profileEditor") as HTMLElement;
const profileNameInput = document.getElementById(
  "profileNameInput",
) as HTMLInputElement;
const whitelistToggle = document.getElementById(
  "whitelistToggle",
) as HTMLInputElement;
const siteInput = document.getElementById("siteInput") as HTMLInputElement;
const addSiteBtn = document.getElementById("addSiteBtn") as HTMLButtonElement;
const siteList = document.getElementById("siteList") as HTMLUListElement;
const saveProfileBtn = document.getElementById(
  "saveProfileBtn",
) as HTMLButtonElement;
const cancelProfileBtn = document.getElementById(
  "cancelProfileBtn",
) as HTMLButtonElement;

const workMins = document.getElementById("workMins") as HTMLInputElement;
const shortBreakMins = document.getElementById(
  "shortBreakMins",
) as HTMLInputElement;
const longBreakMins = document.getElementById(
  "longBreakMins",
) as HTMLInputElement;
const cycles = document.getElementById("cycles") as HTMLInputElement;
const autoStartToggle = document.getElementById(
  "autoStartToggle",
) as HTMLInputElement;

const scheduleToggle = document.getElementById(
  "scheduleToggle",
) as HTMLInputElement;
const scheduleFields = document.getElementById("scheduleFields") as HTMLElement;
const scheduleTime = document.getElementById(
  "scheduleTime",
) as HTMLInputElement;
const dayCheckboxes = Array.from(
  document.querySelectorAll<HTMLInputElement>(
    '.day-picker input[type="checkbox"]',
  ),
);

const unlockPhrase = document.getElementById(
  "unlockPhrase",
) as HTMLInputElement;
const notificationsToggle = document.getElementById(
  "notificationsToggle",
) as HTMLInputElement;

const saveAllBtn = document.getElementById("saveAllBtn") as HTMLButtonElement;
const saveMsg = document.getElementById("saveMsg") as HTMLElement;

const statsPomodoros = document.getElementById("statsPomodoros") as HTMLElement;
const statsMinutes = document.getElementById("statsMinutes") as HTMLElement;

// ─── State ────────────────────────────────────────────────────────────────────
let settings: AppSettings = DEFAULT_SETTINGS;
let editingProfileId: string | null = null;
let editingSites: string[] = [];

// ─── Profile editor ───────────────────────────────────────────────────────────

function openProfileEditor(profile?: BlockProfile): void {
  editingProfileId = profile?.id ?? null;
  profileNameInput.value = profile?.name ?? "";
  whitelistToggle.checked = profile?.whitelistMode ?? false;
  editingSites = profile ? [...profile.sites] : [];
  renderSiteTags();
  profileEditor.classList.remove("hidden");
  profileNameInput.focus();
}

function closeProfileEditor(): void {
  profileEditor.classList.add("hidden");
  editingProfileId = null;
  editingSites = [];
}

function renderSiteTags(): void {
  siteList.innerHTML = "";
  for (const site of editingSites) {
    const li = document.createElement("li");
    li.className = "site-tag";
    li.innerHTML = `<span>${site}</span><button data-site="${site}" aria-label="Remove ${site}">×</button>`;
    li.querySelector("button")?.addEventListener("click", () => {
      editingSites = editingSites.filter((s) => s !== site);
      renderSiteTags();
    });
    siteList.appendChild(li);
  }
}

addSiteBtn.addEventListener("click", () => {
  const raw = siteInput.value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (!raw || editingSites.includes(raw)) {
    siteInput.value = "";
    return;
  }
  editingSites.push(raw);
  siteInput.value = "";
  renderSiteTags();
});

siteInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSiteBtn.click();
});

saveProfileBtn.addEventListener("click", () => {
  const name = profileNameInput.value.trim();
  if (!name) {
    profileNameInput.focus();
    return;
  }

  const profile: BlockProfile = {
    id: editingProfileId ?? `profile-${Date.now()}`,
    name,
    sites: [...editingSites],
    whitelistMode: whitelistToggle.checked,
  };

  const existing = settings.profiles.findIndex((p) => p.id === profile.id);
  if (existing >= 0) {
    settings.profiles[existing] = profile;
  } else {
    settings.profiles.push(profile);
    if (settings.profiles.length === 1) {
      settings.activeProfileId = profile.id;
    }
  }

  closeProfileEditor();
  renderProfilesList();
});

cancelProfileBtn.addEventListener("click", closeProfileEditor);
addProfileBtn.addEventListener("click", () => openProfileEditor());

// ─── Profiles list ────────────────────────────────────────────────────────────

function renderProfilesList(): void {
  profilesList.innerHTML = "";

  for (const profile of settings.profiles) {
    const div = document.createElement("div");
    div.className = `profile-item${profile.id === settings.activeProfileId ? " active" : ""}`;
    div.innerHTML = `
      <div>
        <div class="profile-item-name">${profile.name}${profile.whitelistMode ? ' <em style="font-size:10px;color:var(--text-muted)">(whitelist)</em>' : ""}</div>
        <div class="profile-item-meta">${profile.sites.length} site${profile.sites.length !== 1 ? "s" : ""}</div>
      </div>
      <div class="profile-item-actions">
        ${
          settings.profiles.length > 1 &&
          profile.id !== settings.activeProfileId
            ? `<button class="btn-small set-active-btn" data-id="${profile.id}">Set active</button>`
            : ""
        }
        <button class="btn-small edit-btn" data-id="${profile.id}">Edit</button>
        ${
          settings.profiles.length > 1
            ? `<button class="btn-small btn-danger delete-btn" data-id="${profile.id}">Delete</button>`
            : ""
        }
      </div>
    `;

    div.querySelector(".edit-btn")?.addEventListener("click", () => {
      openProfileEditor(profile);
    });
    div.querySelector(".set-active-btn")?.addEventListener("click", () => {
      settings.activeProfileId = profile.id;
      renderProfilesList();
    });
    div.querySelector(".delete-btn")?.addEventListener("click", () => {
      settings.profiles = settings.profiles.filter((p) => p.id !== profile.id);
      if (settings.activeProfileId === profile.id) {
        settings.activeProfileId = settings.profiles[0]?.id ?? "";
      }
      renderProfilesList();
    });

    profilesList.appendChild(div);
  }
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

scheduleToggle.addEventListener("change", () => {
  scheduleFields.classList.toggle("hidden", !scheduleToggle.checked);
});

// ─── Load & save all ─────────────────────────────────────────────────────────

async function loadSettings(): Promise<void> {
  settings = await storage.getSettings();

  renderProfilesList();

  workMins.value = String(settings.pomodoro.workMinutes);
  shortBreakMins.value = String(settings.pomodoro.shortBreakMinutes);
  longBreakMins.value = String(settings.pomodoro.longBreakMinutes);
  cycles.value = String(settings.pomodoro.cyclesBeforeLongBreak);
  autoStartToggle.checked = settings.pomodoro.autoStartNext;

  const hasSchedule = Boolean(settings.schedule);
  scheduleToggle.checked = hasSchedule;
  scheduleFields.classList.toggle("hidden", !hasSchedule);
  if (settings.schedule) {
    scheduleTime.value = settings.schedule.startTime;
    for (const cb of dayCheckboxes) {
      cb.checked = settings.schedule.days.includes(cb.value as Day);
    }
  }

  unlockPhrase.value = settings.emergencyUnlockPhrase;
  notificationsToggle.checked = settings.notifications;
}

async function loadStats(): Promise<void> {
  const stats = await storage.getTodayStats();
  statsPomodoros.textContent = String(stats.completedPomodoros);
  statsMinutes.textContent = String(stats.totalFocusMinutes);
}

saveAllBtn.addEventListener("click", async () => {
  const schedule = scheduleToggle.checked
    ? {
        startTime: scheduleTime.value || "09:00",
        days: Array.from(dayCheckboxes)
          .filter((cb) => cb.checked)
          .map((cb) => cb.value as Day),
      }
    : null;

  const updated: AppSettings = {
    ...settings,
    pomodoro: {
      workMinutes: Math.max(1, parseInt(workMins.value) || 25),
      shortBreakMinutes: Math.max(1, parseInt(shortBreakMins.value) || 5),
      longBreakMinutes: Math.max(1, parseInt(longBreakMins.value) || 15),
      cyclesBeforeLongBreak: Math.max(1, parseInt(cycles.value) || 4),
      autoStartNext: autoStartToggle.checked,
    },
    schedule,
    emergencyUnlockPhrase:
      unlockPhrase.value.trim() || DEFAULT_SETTINGS.emergencyUnlockPhrase,
    notifications: notificationsToggle.checked,
  };

  await storage.setSettings(updated);
  settings = updated;

  // Re-register schedule alarms in service worker
  await chrome.runtime.sendMessage({ type: "GET_STATE" });

  saveMsg.classList.remove("hidden");
  setTimeout(() => saveMsg.classList.add("hidden"), 2500);
});

loadSettings().catch(console.error);
loadStats().catch(console.error);
