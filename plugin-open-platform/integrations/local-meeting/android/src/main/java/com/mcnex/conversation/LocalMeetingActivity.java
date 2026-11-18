package com.mcnex.conversation;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.*;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class LocalMeetingActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LocalAi model;
    private File modelFile;
    private TextView status, answer;
    private EditText transcript;
    private Button load, mic, summarize;
    private KakaoVoice voice;
    private boolean busy;
    private String beforeVoice;
    private MeetingLink link;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        modelFile = new File(getFilesDir(), "gemma.gguf");
        var panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        int pad = (int)(20 * getResources().getDisplayMetrics().density);
        panel.setPadding(pad, pad * 2, pad, pad);
        var scroll = new ScrollView(this);
        scroll.addView(panel);
        setContentView(scroll);

        var title = new TextView(this);
        title.setText("로컬 대화 요약");
        title.setTextSize(26);
        panel.addView(title);
        status = new TextView(this);
        panel.addView(status);
        load = button(panel, "Gemma 모델 선택", this::pickModel);
        transcript = new EditText(this);
        transcript.setId(101);
        transcript.setHint("받아쓴 대화를 편집하거나 여기에 직접 입력하세요");
        transcript.setMinLines(4);
        transcript.setGravity(android.view.Gravity.TOP);
        panel.addView(transcript);
        mic = button(panel, "한국어 음성 입력", this::toggleMic);
        summarize = button(panel, "한국어 요약 만들기", this::summarize);
        answer = new TextView(this);
        answer.setTextSize(18);
        answer.setTextIsSelectable(true);
        panel.addView(answer);
        var prefs = getSharedPreferences("meeting_link", MODE_PRIVATE);
        String code = prefs.getString("code", null);
        if (code == null) {
            code = java.util.UUID.randomUUID().toString();
            prefs.edit().putString("code", code).apply();
        }
        final String connectionCode = code;
        button(panel, "MemoMind 연결 코드 복사", () -> {
            getSystemService(android.content.ClipboardManager.class)
                .setPrimaryClip(android.content.ClipData.newPlainText("MemoMind 연결 코드", connectionCode));
            status.setText("복사한 코드를 MM Eloquentia에 붙여넣으세요.");
        });
        button(panel, "MM Eloquentia 연결 시작", () -> {
            if (link == null) {
                try { link = new MeetingLink(connectionCode, new EloqSession(this, modelFile)); }
                catch (IOException error) { status.setText("연결 시작 실패 · " + error.getMessage()); return; }
            }
            status.setText("연결 준비됨 · MM Eloquentia에서 청취를 시작하세요.");
        });
        voice = new KakaoVoice(this, new KakaoVoice.Callback() {
            @Override public void text(String text) {
                transcript.setText(beforeVoice.isBlank() ? text : beforeVoice + "\n" + text);
                transcript.setSelection(transcript.length());
            }
            @Override public void state(boolean listening, String message) {
                status.setText(message);
                mic.setText(listening ? "음성 입력 마치기" : "한국어 음성 입력");
                load.setEnabled(!listening && !busy);
                summarize.setEnabled(!listening && !busy && modelFile.isFile());
            }
        });
        setBusy(false, modelFile.isFile() ? "Gemma 2 모델 준비됨" : "다운로드 폴더의 Gemma 2 GGUF를 선택하세요.");
    }

    private Button button(LinearLayout panel, String label, Runnable action) {
        var button = new Button(this);
        button.setText(label);
        button.setOnClickListener(view -> action.run());
        panel.addView(button);
        return button;
    }

    private void pickModel() {
        startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"), 1);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if(request != 1 || result != RESULT_OK || data == null || data.getData() == null) return;
        Uri source = data.getData();
        setBusy(true, "선택한 모델을 앱 내부 저장소에 복사 중…");
        worker.execute(() -> {
            File temp = new File(getFilesDir(), "gemma-import.tmp");
            String message;
            try (var raw = getContentResolver().openInputStream(source)) {
                if(raw == null) throw new IOException("파일을 열 수 없습니다.");
                try (var input = new BufferedInputStream(raw)) {
                    input.mark(4);
                    if(!java.util.Arrays.equals(input.readNBytes(4), new byte[]{'G','G','U','F'}))
                        throw new IOException("GGUF 파일을 선택하세요.");
                    input.reset();
                    Files.copy(input, temp.toPath(), StandardCopyOption.REPLACE_EXISTING);
                }
                try(LocalAi candidate = new LocalAi(temp)) {
                    if(model != null) { model.close(); model = null; }
                }
                Files.move(temp.toPath(), modelFile.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                message = "GGUF 모델 준비됨";
            } catch(Exception | LinkageError error) {
                message = "모델 가져오기 실패 · " + error.getMessage();
            } finally { temp.delete(); }
            complete(message, null);
        });
    }

    private void toggleMic() {
        if(voice.active()) { voice.stop(); return; }
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 2);
            return;
        }
        beforeVoice = transcript.getText().toString().stripTrailing();
        voice.start();
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if(request == 2 && grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) toggleMic();
    }

    private void summarize() {
        String text = transcript.getText().toString().trim();
        if(text.isEmpty() || text.length() > 3000) {
            status.setText("요약할 대화를 1~3,000자로 입력하세요.");
            return;
        }
        answer.setText("");
        setBusy(true, "Gemma로 휴대폰에서 요약 중…");
        worker.execute(() -> {
            try {
                if(model == null) model = new LocalAi(modelFile);
                String summary = model.minutes("대화의 핵심과 결정 사항을 한국어로 요약하세요. 원문에 없는 내용은 쓰지 마세요.", text, 120);
                if(summary.isBlank()) throw new IOException("모델 응답이 비어 있습니다.");
                android.util.Log.i("MemoLocalMeeting", "SUMMARY_OK");
                complete("요약 완료 · 휴대폰에서 생성", summary);
            } catch(Exception | LinkageError error) {
                complete("요약 실패 · " + error.getMessage(), null);
            }
        });
    }

    private void complete(String message, String summary) {
        runOnUiThread(() -> {
            if(isDestroyed()) return;
            if(summary != null) answer.setText(summary);
            setBusy(false, message);
        });
    }

    private void setBusy(boolean active, String message) {
        busy = active;
        if(active) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        status.setText(message);
        load.setEnabled(!active);
        mic.setEnabled(!active);
        summarize.setEnabled(!active && modelFile.isFile());
    }

    @Override protected void onStop() {
        if(voice != null && voice.active()) voice.close();
        super.onStop();
    }

    @Override protected void onDestroy() {
        if (link != null) link.close();
        worker.execute(() -> { if(model != null) model.close(); });
        worker.shutdown();
        super.onDestroy();
    }
}


