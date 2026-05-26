import type { SyncPayload } from "@block-lock/shared-types";

const API_BASE = "https://block-lock.vercel.app/api";
const SYNC_ALARM = "sync-rules";
const SYNC_INTERVAL_MINUTES = 5;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });
  syncRules();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) syncRules();
});

async function syncRules(): Promise<void> {
  const { userId } = await chrome.storage.local.get("userId");
  if (!userId) return;

  const res = await fetch(`${API_BASE}/sync?userId=${userId}`);
  if (!res.ok) return;

  const payload: SyncPayload = await res.json();
  await applyBlockRules(payload);
}

async function applyBlockRules(payload: SyncPayload): Promise<void> {
  const rules = payload.rules
    .filter((r) => r.isActive)
    .map((r, index) => ({
      id: index + 1,
      priority: 1,
      action: { type: "block" as const },
      condition: {
        urlFilter: `||${r.domain}^`,
        resourceTypes: ["main_frame" as const],
      },
    }));

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existing.map((r) => r.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: rules,
  });

  await chrome.storage.local.set({ lastSync: new Date().toISOString() });
}