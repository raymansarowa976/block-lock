import { handleExternalMessage, syncRules, type ExtMessage } from "./auth-handler"
import { flushAnalytics, registerFlushAlarm, FLUSH_ALARM } from "./analytics-flush"
import { registerTabListeners } from "./analytics-buffer"

const SYNC_ALARM = "sync-rules"
const SYNC_INTERVAL_MINUTES = 5

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES })
  registerFlushAlarm()
  syncRules()
  registerTabListeners()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) syncRules()
  if (alarm.name === FLUSH_ALARM) flushAnalytics()
})

chrome.runtime.onMessageExternal.addListener(
  (message: ExtMessage, sender, sendResponse) => {
    handleExternalMessage(message, sender, sendResponse)
    return true // keep channel open for async sendResponse
  },
)