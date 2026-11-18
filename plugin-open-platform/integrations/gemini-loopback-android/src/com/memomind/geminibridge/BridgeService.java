package com.memomind.geminibridge;

import android.app.*;
import android.content.*;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.graphics.PixelFormat;
import android.widget.Button;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

public class BridgeService extends Service {
    static volatile boolean active;
    volatile boolean running;
    volatile ServerSocket server;
    private String token;
    private WindowManager windows;
    private Button floating;
    private void removeFloating() {
        if (floating != null) {
            try { windows.removeView(floating); } catch (RuntimeException ignored) {}
            floating = null;
        }
    }
    private void updateFloating() {
        removeFloating();
        if (!getSharedPreferences("bridge", MODE_PRIVATE).getBoolean("automatic", false)
            || !Settings.canDrawOverlays(this)) return;
        windows = getSystemService(WindowManager.class);
        Button button = new Button(this);
        button.setText("G");
        button.setTextSize(18);
        button.setContentDescription("Gemini 열기. 길게 누르면 수신 중지");
        int size = (int)(56 * getResources().getDisplayMetrics().density);
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            size, size, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
        button.setOnClickListener(v -> { launchFromService(); });
        button.setOnLongClickListener(v -> { stopSelf(); return true; });
        try {
            windows.addView(button, params);
            floating = button;
        } catch (RuntimeException e) {
            notifications.notify(3, notice("G 버튼 표시 실패 · 권한을 확인하세요.").build());
        }
    }
    private boolean automaticAllowed() {
        KeyguardManager lock = getSystemService(KeyguardManager.class);
        return floating != null && floating.isAttachedToWindow() && floating.isShown()
            && Settings.canDrawOverlays(this)
            && !lock.isKeyguardLocked();
    }
    private boolean launchFromService() {
        if (!automaticAllowed()) return false;
        Intent intent = new Intent(Intent.ACTION_VOICE_COMMAND)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { startActivity(intent); return true; }
        catch (ActivityNotFoundException | SecurityException e) {
            Intent fallback = getPackageManager().getLaunchIntentForPackage("com.google.android.apps.bard");
            if (fallback == null) return false;
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { startActivity(fallback); return true; } catch (RuntimeException ignored) { return false; }
        }
    }
    private long lastLaunch = -10000;
    private NotificationManager notifications;
    private final Handler main = new Handler(Looper.getMainLooper());
    private static final String CHANNEL = "gemini_bridge";
    @Override public void onCreate() {
        super.onCreate();
        token = MainActivity.token(this);
        notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel(CHANNEL, "Gemini 호출", NotificationManager.IMPORTANCE_DEFAULT));
        startForeground(1, notice("수신 시작 중…").build());
        running = true;
        active = true;
        new Thread(this::listen, "gemini-loopback").start();
    }
    private Notification.Builder notice(String text) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Gemini Loopback Bridge").setContentText(text).setContentIntent(open);
    }
    private void listen() {
        try (ServerSocket listener = new ServerSocket()) {
            server = listener;
            listener.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 8765), 8);
            if (!running) return;
            notifications.notify(1, notice("수신 중 · 127.0.0.1:8765").setOngoing(true).build());
            while (running) {
                try (Socket client = listener.accept()) {
                    client.setSoTimeout(1500);
                    handle(client);
                } catch (IOException ignored) { if (!running) break; }
            }
        } catch (IOException e) {
            if (running) {
                notifications.notify(3, notice("수신 실패: 포트 사용 여부를 확인하고 앱에서 다시 시작하세요.").build());
                stopSelf();
            }
        }
    }
    private String line(InputStream input) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        for (int i=0; i<4096; i++) {
            int ch = input.read();
            if (ch == -1) throw new EOFException();
            if (ch == 10) return bytes.toString("US-ASCII").replace("\r", "");
            bytes.write(ch);
        }
        throw new IOException("Header too long");
    }
    private void handle(Socket socket) throws IOException {
        InputStream input = socket.getInputStream();
        String[] request = line(input).split(" ");
        String supplied = "";
        boolean ended = false;
        for (int i=0; i<32; i++) {
            String header = line(input);
            if (header.isEmpty()) { ended = true; break; }
            int colon = header.indexOf(':');
            if (colon > 0 && header.substring(0, colon).equalsIgnoreCase("X-Gemini-Token"))
                supplied = header.substring(colon+1).trim();
        }
        if (!ended || request.length != 3) { respond(socket, 400, "{\"ok\":false}"); return; }
        String method = request[0], path = request[1];
        if (!path.equals("/health") && !path.equals("/launch-gemini") && !path.equals("/answer")) { respond(socket,404,"{\"ok\":false}"); return; }
        // CORS preflight never performs an action.
        if (method.equals("OPTIONS")) { respond(socket,200,"{\"ok\":true}"); return; }
        if (!MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8))) {
            respond(socket,403,"{\"ok\":false}"); return;
        }
        if (method.equals("GET") && path.equals("/answer")) {
            respond(socket,200,GeminiAccessibilityService.snapshot()); return;
        }
        if (method.equals("GET") && path.equals("/health")) {
            respond(socket,200,"{\"ok\":true,\"bridge\":\"memomind-gemini-v1\"}"); return;
        }
        if (!method.equals("POST") || !path.equals("/launch-gemini")) { respond(socket,405,"{\"ok\":false}"); return; }
        long now = SystemClock.elapsedRealtime();
        if (now-lastLaunch < 2500) { respond(socket,429,"{\"ok\":false}"); return; }
        lastLaunch = now;
        GeminiAccessibilityService.clearAnswer();
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("unavailable");
        main.post(() -> {
            try {
                if (!running) return;
                MainActivity activity = MainActivity.visible;
                if (activity != null && activity.launchAssistant()) result.set("activity_requested");
                else if (launchFromService()) result.set("activity_requested");
                else {
                    Intent launch = new Intent(Intent.ACTION_VOICE_COMMAND);
                    if (launch.resolveActivity(getPackageManager()) == null)
                        launch = getPackageManager().getLaunchIntentForPackage("com.google.android.apps.bard");
                    if (launch == null || !notifications.areNotificationsEnabled()) return;
                    PendingIntent action = PendingIntent.getActivity(this, 2, launch,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    notifications.notify(2, new Notification.Builder(this, CHANNEL)
                        .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Gemini 열기")
                        .setContentText("안경의 호출 요청입니다. 눌러서 Gemini를 여세요.")
                        .setContentIntent(action).setAutoCancel(true).build());
                    result.set("notification");
                }
            } catch (RuntimeException ignored) {} finally { done.countDown(); }
        });
        try { done.await(1200, TimeUnit.MILLISECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        String delivery = result.get();
        if (delivery.equals("unavailable")) { respond(socket,409,"{\"ok\":false}"); return; }
        respond(socket,200,"{\"ok\":true,\"bridge\":\"memomind-gemini-v1\",\"delivery\":\"" + delivery + "\"}");
    }
    private void respond(Socket socket, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        String header = "HTTP/1.1 " + status + " Response\r\n"
            + "Access-Control-Allow-Origin: *\r\n"
            + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            + "Access-Control-Allow-Headers: X-Gemini-Token\r\n"
            + "Access-Control-Allow-Private-Network: true\r\n"
            + "Content-Type: application/json\r\nCache-Control: no-store\r\n"
            + "Content-Length: " + bytes.length + "\r\nConnection: close\r\n\r\n";
        socket.getOutputStream().write(header.getBytes(StandardCharsets.US_ASCII));
        socket.getOutputStream().write(bytes);
        socket.getOutputStream().flush();
    }
    @Override public int onStartCommand(Intent i, int flags, int id) {
        updateFloating();
        return START_NOT_STICKY;
    }
    @Override public void onDestroy() {
        running = false;
        active = false;
        GeminiAccessibilityService.clearAnswer();
        removeFloating();
        try { if (server != null) server.close(); } catch (IOException ignored) {}
        notifications.cancel(2);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent i) { return null; }
}
