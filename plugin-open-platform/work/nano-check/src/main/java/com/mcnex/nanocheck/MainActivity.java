package com.mcnex.nanocheck;
import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.widget.TextView;
import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.prompt.*;
import com.google.mlkit.genai.prompt.java.GenerativeModelFutures;
import java.util.concurrent.TimeUnit;
public class MainActivity extends Activity {
  private TextView result;
  private void show(String message) {
    Log.i("MemoNanoCheck", message);
    runOnUiThread(() -> result.setText(message));
  }
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    result = new TextView(this);
    setContentView(result);
    new Thread(() -> {
      try {
        GenerativeModelFutures model = GenerativeModelFutures.from(Generation.INSTANCE.getClient());
        int status = model.checkStatus().get(30, TimeUnit.SECONDS);
        if (status != FeatureStatus.AVAILABLE) { show("STATUS=" + status); return; }
        show("AVAILABLE");
        GenerateContentResponse answer = model.generateContent(new GenerateContentRequest.Builder(
            new TextPart("다음 가상 회의 내용을 한국어 한 문장으로 요약해 주세요. 민수는 금요일까지 시제품을 준비하고 지연은 다음 주 월요일에 테스트한다.")).build()).get(45, TimeUnit.SECONDS);
        show("RESULT=" + answer.getCandidates().get(0).getText());
      } catch (Exception error) { Log.e("MemoNanoCheck", "TEST_FAILED", error); show(error.toString()); }
    }).start();
  }
}
