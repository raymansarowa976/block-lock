import { handleExternalMessage, syncRules, type ExtMessage } from "./auth-handler"

const SYNC_ALARM = "sync-rules"
const SYNC_INTERVAL_MINUTES = 5

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES })
  syncRules()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) syncRules()
})

chrome.runtime.onMessageExternal.addListener(
  (message: ExtMessage, sender, sendResponse) => {
    handleExternalMessage(message, sender, sendResponse)
    return true // keep channel open for async sendResponse
  },
)