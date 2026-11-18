package com.memomind.webtoon;
import android.net.Uri;
import android.os.*;
import android.util.Base64;
import android.webkit.WebView;
import org.json.JSONObject;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Adapter to the real PhoneSDK runtime in a Host-owned trusted WebView.
 * It does not own a GATT connection or assume an undocumented BLE UUID. */
public final class WebViewSceneTransport implements HudTransport, AutoCloseable {
    private final WebView view; private final Uri trusted; private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicBoolean busy = new AtomicBoolean(); private volatile boolean closed;
    public WebViewSceneTransport(WebView view, String trustedPluginUrl) {
        this.view = view; trusted = Uri.parse(trustedPluginUrl);
        String host = trusted.getHost();
        if (trusted.getUserInfo() != null || host == null || !("https".equals(trusted.getScheme()) || ("http".equals(trusted.getScheme()) && ("127.0.0.1".equals(host) || "localhost".equals(host))))) throw new IllegalArgumentException("신뢰된 플러그인 URL이 필요합니다.");
    }
    public boolean isTrusted() {
        if (view.getUrl() == null) return false; Uri current = Uri.parse(view.getUrl());
        return !closed && trusted.getScheme().equals(current.getScheme()) && trusted.getHost().equals(current.getHost()) && trusted.getPort() == current.getPort() && trusted.getPath().equals(current.getPath());
    }
    @Override public CompletableFuture<Receipt> present(byte[] pixels) {
        CompletableFuture<Receipt> future = new CompletableFuture<>();
        if (pixels.length != 105000 || closed || !busy.compareAndSet(false, true)) { future.completeExceptionally(new IllegalStateException("화면 전송 대기 중이거나 연결이 종료되었습니다.")); return future; }
        future.whenComplete((receipt, error) -> busy.set(false));
        String id = UUID.randomUUID().toString();
        final String payload;
        try { payload = new JSONObject().put("requestId", id).put("pixels", Base64.encodeToString(pixels, Base64.NO_WRAP)).toString(); }
        catch (Exception error) { future.completeExceptionally(error); return future; }
        long deadline = SystemClock.elapsedRealtime() + 12000;
        main.post(() -> {
            if (!isTrusted()) { future.completeExceptionally(new SecurityException("플러그인 연결이 변경되었습니다.")); return; }
            view.evaluateJavascript("!!(window.MemoWebtoonNative && window.MemoWebtoonNative.submit(" + payload + "))", accepted -> {
                if (!"true".equals(accepted)) future.completeExceptionally(new IllegalStateException("웹툰 전송 모듈이 준비되지 않았습니다."));
                else poll(id, deadline, future);
            });
        }); return future;
    }
    private void poll(String id, long deadline, CompletableFuture<Receipt> future) {
        if (future.isDone()) return;
        if (!isTrusted() || SystemClock.elapsedRealtime() > deadline) { future.completeExceptionally(new TimeoutException("안경 전송 확인 시간이 초과되었습니다.")); return; }
        view.evaluateJavascript("window.MemoWebtoonNative && window.MemoWebtoonNative.takeAck(" + JSONObject.quote(id) + ")", result -> {
            try {
                if (result == null || "null".equals(result) || "undefined".equals(result)) { main.postDelayed(() -> poll(id, deadline, future), 32); return; }
                JSONObject ack = new JSONObject(result);
                if (ack.optBoolean("ok")) future.complete(new Receipt(ack.optLong("frameId"), ack.optLong("milliseconds")));
                else future.completeExceptionally(new IllegalStateException(ack.optString("error", "안경 전송 실패")));
            } catch (Exception error) { future.completeExceptionally(error); }
        });
    }
    @Override public void close() { closed = true; }
}
