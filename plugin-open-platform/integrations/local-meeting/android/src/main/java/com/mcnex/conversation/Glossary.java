package com.mcnex.conversation;
import java.util.*;
public final class Glossary {
 private static final String[][] TERMS={
  {"HDR","High Dynamic Range. 밝은 부분과 어두운 부분의 정보를 함께 표현하는 기술. 역광에서 얼굴과 배경의 세부를 살리는 데 활용한다."},
  {"OIS","Optical Image Stabilization. 렌즈나 센서를 물리적으로 움직여 흔들림을 보정하는 방식."},
  {"EIS","Electronic Image Stabilization. 영상 데이터를 처리해 흔들림을 줄이는 전자식 보정 방식."},
  {"MTF","Modulation Transfer Function. 공간 주파수에 따라 영상 시스템이 대비를 얼마나 전달하는지 나타내는 특성."},
  {"SNR","Signal-to-Noise Ratio. 신호 크기와 잡음 크기의 비율."},
  {"ISP","Image Signal Processor. 이미지 센서의 신호를 영상으로 처리하는 장치."},
  {"API","Application Programming Interface. 프로그램이 다른 기능이나 서비스에 요청하고 결과를 받는 인터페이스."},
  {"SDK","Software Development Kit. 앱이나 기능 개발에 사용하는 도구와 라이브러리 묶음."},
  {"LLM","Large Language Model. 텍스트 문맥을 처리하고 다음 내용을 생성하도록 학습된 언어 모델."},
  {"NPU","Neural Processing Unit. 신경망 연산을 가속하는 처리 장치."},
  {"GPU","Graphics Processing Unit. 그래픽 및 병렬 연산을 수행하는 처리 장치."},
  {"EBITDA","Earnings Before Interest, Taxes, Depreciation and Amortization. 이자, 법인세, 감가상각비 및 무형자산상각비 차감 전 이익. 현금흐름과 동일하지 않다."},
  {"양자화","모델의 가중치나 연산 값을 더 적은 비트로 표현하는 기법. 용량과 연산 부담을 줄일 수 있지만 정확도가 달라질 수 있다."}
 };
 public static String reference(String context,String term){String input=(context+" "+term).toUpperCase(Locale.ROOT);StringBuilder out=new StringBuilder();for(String[] item:TERMS){String key=item[0];boolean hit=key.matches("[A-Z]+")?java.util.regex.Pattern.compile("(?<![A-Z0-9])"+key+"(?![A-Z0-9])").matcher(input).find():input.contains(key);if(hit)out.append(key).append(": ").append(item[1]).append("\n");}return out.toString();}
 public static String exact(String term){for(String[] item:TERMS)if(item[0].equalsIgnoreCase(term.trim()))return item[1];return null;}
 private Glossary(){}
}
