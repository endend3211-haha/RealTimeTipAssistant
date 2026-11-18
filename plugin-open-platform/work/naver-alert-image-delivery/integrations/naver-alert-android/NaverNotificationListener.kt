package com.mcnex.naveralert

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

class NaverNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName != "com.nhn.android.nmap") return
        if (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val extras = sbn.notification.extras
        val text = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
            ?.takeIf { it.isNotBlank() }
            ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
            ?.joinToString(" · ").orEmpty()
        val value = JSONObject()
            .put("key", sbn.key)
            .put("packageName", sbn.packageName)
            .put("postedAt", sbn.postTime)
            .put("title", extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty().take(300))
            .put("text", text.ifBlank { lines }.take(600))
            .put("subText", extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString().orEmpty().take(300))
        NaverNotificationRuntime.emit(JSONObject().put("type", "posted").put("notification", value))
    }
    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        if (sbn.packageName == "com.nhn.android.nmap")
            NaverNotificationRuntime.emit(JSONObject().put("type", "removed").put("key", sbn.key))
    }
}
