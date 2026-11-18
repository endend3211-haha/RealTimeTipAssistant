package com.assistant.realtimetip.service

import android.content.Context
import android.util.Log
import com.assistant.realtimetip.TipAssistantApplication
import com.assistant.realtimetip.data.local.entity.TipHistory
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class MemoMindLocalServer(
    private val app: TipAssistantApplication,
    private val scope: CoroutineScope,
) {
    private var serverSocket: ServerSocket? = null
    private val executor = Executors.newFixedThreadPool(4)
    @Volatile private var isRunning = false

    fun start(port: Int = 18772) {
        if (isRunning) return
        isRunning = true
        scope.launch(Dispatchers.IO) {
            try {
                val server = ServerSocket()
                server.reuseAddress = true
                server.bind(InetSocketAddress("127.0.0.1", port))
                serverSocket = server
                Log.i("MemoMindLocalServer", "Local HTTP server listening on 127.0.0.1:$port")
                while (isRunning && !server.isClosed) {
                    try {
                        val client = server.accept()
                        executor.execute { handleClient(client) }
                    } catch (e: Exception) {
                        if (!isRunning) break
                    }
                }
            } catch (e: Exception) {
                Log.e("MemoMindLocalServer", "Error starting local server on $port", e)
            } finally {
                isRunning = false
            }
        }
    }

    fun stop() {
        isRunning = false
        try {
            serverSocket?.close()
        } catch (_: Exception) {}
        serverSocket = null
    }

    private fun handleClient(socket: Socket) {
        socket.use { s ->
            s.soTimeout = 3000
            val reader = BufferedReader(InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8))
            val line = reader.readLine() ?: return
            val parts = line.split(" ")
            if (parts.size < 2) return
            val method = parts[0]
            val path = parts[1]

            var contentLength = 0
            while (true) {
                val header = reader.readLine() ?: break
                if (header.isEmpty()) break
                val lower = header.lowercase()
                if (lower.startsWith("content-length:")) {
                    contentLength = lower.substringAfter(":").trim().toIntOrNull() ?: 0
                }
            }

            var requestBody = ""
            if (contentLength in 1..65535) {
                val buf = CharArray(contentLength)
                var read = 0
                while (read < contentLength) {
                    val r = reader.read(buf, read, contentLength - read)
                    if (r == -1) break
                    read += r
                }
                requestBody = String(buf, 0, read)
            }

            if (method.equals("OPTIONS", ignoreCase = true)) {
                sendResponse(s, 204, JSONObject())
                return
            }

            when {
                path == "/health" -> {
                    val res = JSONObject()
                        .put("status", "ok")
                        .put("service", "RealTimeTipAssistant")
                        .put("listening", app.pipelineController.isListening.value)
                    sendResponse(s, 200, res)
                }
                path.startsWith("/live") -> {
                    val res = JSONObject()
                    val partial = app.pipelineController.partialCaption.value
                    val recentLogs = app.pipelineController.recentLogs.value.takeLast(4).map { it.correctedText }
                    val activeCaption = if (partial.isNotBlank()) partial else (recentLogs.lastOrNull() ?: "")
                    res.put("caption", activeCaption)

                    val recentArray = JSONArray()
                    recentLogs.forEach { recentArray.put(it) }
                    res.put("recentCaptions", recentArray)

                    val activeTip = app.pipelineController.currentDisplayedTip.value
                    if (activeTip != null) {
                        val header = formatHudMetadataHeader(activeTip)
                        val tipLines = app.memoMindHudDispatcher.formatFullHudLines(activeTip)
                        val linesArray = JSONArray()
                        tipLines.forEach { linesArray.put(it) }
                        val tipObj = JSONObject()
                            .put("header", header)
                            .put("lines", linesArray)
                        res.put("tip", tipObj)
                    } else {
                        res.put("tip", JSONObject.NULL)
                    }
                    res.put("listening", app.pipelineController.isListening.value)
                    sendResponse(s, 200, res)
                }
                path == "/control" && method.equals("POST", ignoreCase = true) -> {
                    try {
                        val json = JSONObject(requestBody)
                        val target = json.optString("target")
                        val value = json.optBoolean("value", true)
                        if (target == "sttListening") {
                            scope.launch(Dispatchers.Main) {
                                if (value) {
                                    ListeningForegroundService.start(app)
                                } else {
                                    ListeningForegroundService.stop(app)
                                }
                            }
                        }
                        sendResponse(s, 200, JSONObject().put("success", true))
                    } catch (e: Exception) {
                        sendResponse(s, 400, JSONObject().put("error", e.message))
                    }
                }
                else -> {
                    sendResponse(s, 404, JSONObject().put("error", "Not found"))
                }
            }
        }
    }

    private fun sendResponse(socket: Socket, statusCode: Int, body: JSONObject) {
        val bytes = body.toString().toByteArray(StandardCharsets.UTF_8)
        val out: OutputStream = socket.getOutputStream()
        val headers = "HTTP/1.1 $statusCode OK\r\n" +
                "Content-Type: application/json; charset=utf-8\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: Content-Type, Authorization, X-Memo-Plugin\r\n" +
                "Access-Control-Allow-Private-Network: true\r\n" +
                "Content-Length: ${bytes.size}\r\n" +
                "Connection: close\r\n\r\n"
        out.write(headers.toByteArray(StandardCharsets.US_ASCII))
        out.write(bytes)
        out.flush()
    }

    private fun formatHudMetadataHeader(tip: TipHistory?): String {
        if (tip == null) return "[대기 중] 대화 감지 대기"
        val timeStr = SimpleDateFormat("HH:mm", Locale.KOREA).format(Date(tip.timestamp))
        val dateStr = SimpleDateFormat("M/d", Locale.KOREA).format(Date(tip.timestamp))
        val (senderOrSource, titlePart) = if (tip.referenceTitle.contains("|")) {
            val s = tip.referenceTitle.substringBefore("|").trim()
            val t = tip.referenceTitle.substringAfter("|").trim()
            s to t
        } else {
            tip.referenceTitle.trim() to ""
        }
        return when (tip.sourceType.uppercase()) {
            "WEB" -> {
                val src = senderOrSource.ifBlank { "인터넷" }
                "[💡 TIP] [웹 검색] $src · $dateStr"
            }
            "EMAIL" -> {
                val cleanSender = senderOrSource
                    .substringBefore("<")
                    .trim()
                    .ifBlank { senderOrSource.substringBefore("@") }
                    .ifBlank { "발신자" }
                "[💡 TIP] [이메일] $cleanSender · $timeStr"
            }
            "STOCK" -> {
                val market = if (senderOrSource.contains("Yahoo", ignoreCase = true)) "Yahoo Finance" else "네이버 증권"
                "[💡 TIP] [주식] $market"
            }
            "NEWS" -> {
                val publisher = senderOrSource.ifBlank { "언론사" }
                "[💡 TIP] [뉴스] $publisher · $dateStr"
            }
            "CALENDAR" -> "[💡 TIP] [캘린더] $dateStr $timeStr"
            "CONTACTS" -> {
                val name = titlePart.ifBlank { senderOrSource }
                    .removePrefix("연락처:").removePrefix("연락처").trim()
                    .substringBefore(" ").substringBefore("(").trim()
                    .ifBlank { "연락처" }
                "[💡 TIP] [연락처] $name"
            }
            "DICTIONARY" -> {
                val word = titlePart.ifBlank { senderOrSource }.removePrefix("단어:").trim()
                "[💡 TIP] [사전] $word"
            }
            "CALL" -> {
                val caller = titlePart.ifBlank { senderOrSource }.removePrefix("통화 요약:").removePrefix("통화 기록:").trim().ifBlank { "통화" }
                "[💡 TIP] [통화] $caller · $timeStr"
            }
            else -> "[💡 TIP] [HUD] $dateStr $timeStr"
        }
    }
}
