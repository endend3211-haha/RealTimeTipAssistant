package com.assistant.realtimetip.data.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.assistant.realtimetip.TipAssistantApplication
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Background WorkManager worker responsible for synchronizing IMAP emails
 * and RSS news feeds on a configurable schedule or on-demand.
 */
class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val app = applicationContext as? TipAssistantApplication ?: return@withContext Result.failure()

        val emailSyncManager = app.emailSyncManager
        val newsSyncManager = app.newsSyncManager

        var hasFailure = false

        // 1. Sync Emails (if credentials configured)
        try {
            val emailResult = emailSyncManager.syncEmails()
            if (emailResult.isFailure && !emailResult.exceptionOrNull()?.message.orEmpty().contains("설정되지 않았습니다")) {
                hasFailure = true
            }
        } catch (e: Exception) {
            e.printStackTrace()
            hasFailure = true
        }

        // 2. Sync News
        try {
            val newsResult = newsSyncManager.syncNews()
            if (newsResult.isFailure) {
                hasFailure = true
            }
        } catch (e: Exception) {
            e.printStackTrace()
            hasFailure = true
        }

        if (hasFailure) {
            Result.retry()
        } else {
            Result.success()
        }
    }

    companion object {
        const val PERIODIC_WORK_TAG = "periodic_email_news_sync"
        const val ONE_TIME_WORK_TAG = "one_time_email_news_sync"

        private val defaultConstraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        /**
         * Enqueues an immediate, one-time sync task.
         */
        fun enqueueImmediateSync(context: Context): UUID {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(defaultConstraints)
                .addTag(ONE_TIME_WORK_TAG)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                ONE_TIME_WORK_TAG,
                ExistingWorkPolicy.REPLACE,
                request
            )

            return request.id
        }

        /**
         * Schedules or updates periodic background synchronization.
         * @param intervalMinutes Interval in minutes (15, 30, 60 min).
         * Note: WorkManager enforces a minimum periodic interval of 15 minutes.
         */
        fun schedulePeriodicSync(context: Context, intervalMinutes: Long) {
            if (intervalMinutes <= 0) {
                cancelPeriodicSync(context)
                return
            }

            val safeInterval = intervalMinutes.coerceAtLeast(15)
            val periodicRequest = PeriodicWorkRequestBuilder<SyncWorker>(
                safeInterval, TimeUnit.MINUTES,
                5, TimeUnit.MINUTES // Flex interval
            )
                .setConstraints(defaultConstraints)
                .addTag(PERIODIC_WORK_TAG)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_TAG,
                ExistingPeriodicWorkPolicy.UPDATE,
                periodicRequest
            )
        }

        /**
         * Cancels active periodic background synchronization.
         */
        fun cancelPeriodicSync(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK_TAG)
        }
    }
}
