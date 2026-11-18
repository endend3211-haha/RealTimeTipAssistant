package com.memomind.host.messengerreply

import android.app.Notification
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * No messenger vendor API is used. Replies execute the RemoteInput action that
 * the messenger itself attached to the Android notification.
 */
class MessengerNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val config = MemoMessengerRuntime.config
        val messengerId = config.detect(sbn.packageName, sbn.notification) ?: return
        val extras = sbn.notification.extras
        val message = sequenceOf(
            extras.getCharSequence(Notification.EXTRA_BIG_TEXT),
            extras.getCharSequence(Notification.EXTRA_TEXT),
        ).firstOrNull { !it.isNullOrBlank() }?.toString()?.trim() ?: return
        val sender = extras.getCharSequence(Notification.EXTRA_TITLE)
            ?.toString()?.trim().orEmpty().ifBlank { "알 수 없는 발신자" }
        val replyAction = findReplyAction(sbn.notification)
        MemoMessengerRuntime.post(
            PostedMessengerNotification(
                key = sbn.key,
                messengerId = messengerId,
                packageName = sbn.packageName,
                app = config.label(messengerId),
                sender = sender,
                message = message,
                canReply = replyAction != null,
                postedAt = sbn.postTime,
            ),
            replyAction,
        )
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        MemoMessengerRuntime.remove(sbn.key)
    }

    override fun onListenerDisconnected() {
        NotificationReplies.clear()
    }

    private fun findReplyAction(notification: Notification): ReplyTarget? {
        val candidates = notification.actions.orEmpty().mapNotNull { action ->
            val input = action.remoteInputs?.firstOrNull { it.allowFreeFormInput }
                ?: return@mapNotNull null
            ReplyTarget(action, input)
        }
        return candidates.firstOrNull {
            it.action.semanticAction == Notification.Action.SEMANTIC_ACTION_REPLY
        } ?: candidates.firstOrNull()
    }
}

data class ReplyTarget(
    val action: Notification.Action,
    val remoteInput: android.app.RemoteInput,
)

data class PostedMessengerNotification(
    val key: String,
    val messengerId: String,
    val packageName: String,
    val app: String,
    val sender: String,
    val message: String,
    val canReply: Boolean,
    val postedAt: Long,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("key", key)
        .put("messengerId", messengerId)
        .put("packageName", packageName)
        .put("app", app)
        .put("sender", sender)
        .put("message", message)
        .put("canReply", canReply)
        .put("postedAt", postedAt)
}

object NotificationReplies {
    private val targets = ConcurrentHashMap<String, ReplyTarget>()

    fun put(key: String, target: ReplyTarget?) {
        if (target == null) targets.remove(key) else targets[key] = target
    }

    fun contains(key: String): Boolean = targets.containsKey(key)

    fun remove(key: String) {
        targets.remove(key)
    }

    fun clear() {
        targets.clear()
    }

    fun send(key: String, text: String): Result<Unit> = runCatching {
        require(text.isNotBlank()) { "답장 내용이 비어 있습니다." }
        val target = targets.remove(key) ?: error("답장 가능한 알림이 만료되었거나 없습니다.")
        val fillInIntent = Intent()
        val results = Bundle().apply {
            putCharSequence(target.remoteInput.resultKey, text.trim())
        }
        android.app.RemoteInput.addResultsToIntent(
            arrayOf(target.remoteInput),
            fillInIntent,
            results,
        )
        android.app.RemoteInput.setResultsSource(fillInIntent, android.app.RemoteInput.SOURCE_FREE_FORM_INPUT)
        target.action.actionIntent.send(null, 0, fillInIntent)
    }
}
