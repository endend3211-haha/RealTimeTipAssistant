package com.mcnex.conversation;
import org.junit.Test;import static org.junit.Assert.*;import java.util.*;import org.json.*;
public class KakaoAnswerTest {
 static class Engine implements AiEngine {String answer,input;int calls;Engine(String answer){this.answer=answer;}public String explain(String c,String t,String m){throw new AssertionError();}public String minutes(String instruction,String text,int maxTokens){input=text;calls++;return answer;}public void close(){}public void cancel(){}}
 private List<KakaoMemory.Evidence> evidence(){return Arrays.asList(new KakaoMemory.Evidence(9,123456,"시험방","시험 발신자","목요일 14시 회의 \"합성 시험\""));}
 @Test public void noEvidenceNeverCallsAi()throws Exception{Engine e=new Engine("wrong");KakaoAnswer.Answer result=KakaoAnswer.generate(e,"회의 일정?",Collections.emptyList());assertEquals(0,e.calls);assertTrue(result.references.isEmpty());}
 @Test public void groundedAnswerAndEscapedEvidence()throws Exception{Engine e=new Engine("{\"answer\":\"목요일 14시입니다.\",\"sources\":[1,1]}");KakaoAnswer.Answer result=KakaoAnswer.generate(e,"회의 일정?",evidence());assertEquals(Arrays.asList(1),result.references);assertTrue(result.text.contains("목요일"));assertEquals(evidence().get(0).text,new JSONObject(e.input).getJSONArray("sources").getJSONObject(0).getString("text"));}
 @Test public void rejectsInventedReference()throws Exception{Engine e=new Engine("{\"answer\":\"금요일입니다.\",\"sources\":[9]}");KakaoAnswer.Answer result=KakaoAnswer.generate(e,"일정",evidence());assertTrue(result.references.isEmpty());assertFalse(result.text.contains("금요일"));}
 @Test public void rejectsUncitedClaimsAndMalformedOutput()throws Exception{for(String raw:Arrays.asList("{\"answer\":\"금요일\",\"sources\":[]}","금요일입니다","{\"answer\":\"금요일\",\"sources\":[1.5]}")){KakaoAnswer.Answer result=KakaoAnswer.generate(new Engine(raw),"일정",evidence());assertTrue(result.references.isEmpty());assertFalse(result.text.contains("금요일"));}}
}
