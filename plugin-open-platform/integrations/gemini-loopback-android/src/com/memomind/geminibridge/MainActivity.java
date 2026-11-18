package com.memomind.geminibridge;

import android.app.*;
import android.os.*;
import android.content.*;
import android.widget.*;
import android.Manifest;
import android.provider.Settings;
import android.net.Uri;
import java.security.SecureRandom;

public class MainActivity extends Activity {
    static volatile MainActivity visible;
    static String token(Context context) {
        android.content.SharedPreferences prefs = context.getSharedPreferences("bridge", MODE_PRIVATE);
        String value = prefs.getString("token", null);
        if (value == null) {
            byte[] bytes = new byte[16];
            new SecureRandom().nextBytes(bytes);
            StringBuilder b = new StringBuilder();
            for (byte x : bytes) b.append(String.format(java.util.Locale.ROOT, "%02x", x & 255));
            value = b.toString();
            prefs.edit().putString("token", value).apply();
        }
        return value;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(32,48,32,32);
        TextView title = new TextView(this);
        title.setText("Gemini Loopback Bridge 1.2.0");
        title.setTextSize(24);
        layout.addView(title);
        TextView help = new TextView(this);
        help.setText("1. 알림 권한을 허용하세요.\n2. 수신 시작을 누르세요.\n3. 연결 코드를 복사하여 MemoMind 플러그인에 붙여넣으세요.\n\n자동 열기를 켜면 작은 G 버튼이 표시되고 안경 입력으로 Gemini 실행을 요청합니다. G를 누르면 수동 실행, 길게 누르면 수신 중지입니다. 화면 잠금 시에는 알림을 사용합니다. Live 대화 시작은 보장하지 않습니다.\n\n127.0.0.1:8765 · 인터넷/마이크 사용 없음");
        layout.addView(help);
        TextView code = new TextView(this);
        code.setText(token(this));
        code.setTextIsSelectable(true);
        code.setTextSize(18);
        layout.addView(code);
        Button copy = new Button(this);
        copy.setText("연결 코드 복사");
        copy.setOnClickListener(v -> ((ClipboardManager)getSystemService(CLIPBOARD_SERVICE))
            .setPrimaryClip(ClipData.newPlainText("Gemini connection code", token(this))));
        layout.addView(copy);
        TextView status = new TextView(this);
        status.setText("수신 상태는 상단 상시 알림에서 확인하세요.");
        layout.addView(status);
        Button start = new Button(this);
        start.setText("수신 시작");
        start.setOnClickListener(v -> {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
                status.setText("알림을 허용한 다음 수신 시작을 다시 누르세요.");
                return;
            }
            startForegroundService(new Intent(this, BridgeService.class));
            status.setText("수신 시작 요청됨 · 상단 알림의 실행 상태를 확인하세요.");
        });
        layout.addView(start);

        Button permission = new Button(this);
        permission.setText("다른 앱 위에 표시 권한 설정");
        permission.setOnClickListener(v -> {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())));
            } catch (RuntimeException e) {
                status.setText("설정 > 애플리케이션 > 특별한 접근 > 다른 앱 위에 표시에서 이 앱을 허용하세요.");
            }
        });
        layout.addView(permission);
        android.content.SharedPreferences prefs = getSharedPreferences("bridge", MODE_PRIVATE);
        Switch automatic = new Switch(this);
        automatic.setText("안경 입력으로 바로 열기 · G 버튼 표시");
        automatic.setChecked(prefs.getBoolean("automatic", false));
        automatic.setOnCheckedChangeListener((button, checked) -> {
            if (checked && !Settings.canDrawOverlays(this)) {
                automatic.setChecked(false);
                status.setText("먼저 위의 권한 설정에서 허용한 뒤 다시 켜세요.");
                return;
            }
            prefs.edit().putBoolean("automatic", checked).apply();
            status.setText(checked ? "자동 열기 켜짐 · 수신 시작을 누르면 G 버튼이 표시됩니다."
                : "자동 열기 꺼짐 · 수신 시작을 눌러 적용하세요.");
        });
        layout.addView(automatic);
        TextView privacy = new TextView(this);
        privacy.setText("답변 표시: 접근성 설정에서 ‘Gemini 답변 → 글라스’를 켜세요. 수신 중 Gemini 화면의 확인된 답변 본문만 읽습니다. 다른 앱/입력창은 제외하며 답변은 메모리에 최대 2분 보관합니다. 수신 중지 시 지웁니다.");
        layout.addView(privacy);
        Button accessibility = new Button(this);
        accessibility.setText("Gemini 답변 읽기 접근성 설정");
        accessibility.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        layout.addView(accessibility);
        Button stop = new Button(this);
        stop.setText("수신 중지");
        stop.setOnClickListener(v -> {
            stopService(new Intent(this, BridgeService.class));
            status.setText("수신 중지됨");
        });
        layout.addView(stop);
        Button test = new Button(this);
        test.setText("이 화면에서 Gemini 실행 테스트");
        test.setOnClickListener(v -> {
            if (!launchAssistant()) status.setText("음성 어시스턴트 또는 Gemini 앱을 찾을 수 없습니다.");
        });
        layout.addView(test);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(layout);
        setContentView(scroll);
    }
    @Override protected void onResume() { super.onResume(); visible = this; }
    @Override protected void onPause() { if (visible == this) visible = null; super.onPause(); }
    boolean launchAssistant() {
        try { startActivity(new Intent(Intent.ACTION_VOICE_COMMAND)); return true; }
        catch (android.content.ActivityNotFoundException | SecurityException e) {
            Intent fallback = getPackageManager().getLaunchIntentForPackage("com.google.android.apps.bard");
            if (fallback == null) return false;
            try { startActivity(fallback); return true; } catch (RuntimeException ignored) { return false; }
        }
    }
}
