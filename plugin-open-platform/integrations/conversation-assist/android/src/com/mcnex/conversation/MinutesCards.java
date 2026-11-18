package com.mcnex.conversation;
import java.util.*;
final class MinutesCards {
 static final class Section {final String title;final List<String> lines=new ArrayList<>();Section(String t){title=t;}}
 static List<Section> parse(String raw){List<Section> out=new ArrayList<>();Section current=new Section("회의록 안내");out.add(current);for(String line:raw.split("\n",-1)){String clean=line.trim().replaceAll("^#{1,6}\\s*", "").replace("**","").replace("===","").trim();String heading=clean.replaceFirst("^\\d+[.)]\\s*","").replaceFirst("[:：]$","").trim();boolean explicit=line.trim().startsWith("#")||line.trim().startsWith("===")||(line.trim().startsWith("**")&&line.trim().endsWith("**"));boolean known=heading.matches("(회의 요약|핵심 요약|주요 논의|결정 사항|할 일.*|실행 과제.*|확인 필요 사항|추가 확인 사항|구간별 상세 요약)");if(!clean.isEmpty()&&(known||explicit)&&clean.length()<65){current=new Section(heading);out.add(current);}else if(!clean.isEmpty())current.lines.add(clean);}return out;}
 static String icon(String title){if(title.contains("요약")&&!title.contains("구간"))return "summary";if(title.contains("결정"))return "check";if(title.contains("할 일")||title.contains("과제"))return "tasks";if(title.contains("확인"))return "question";return "notes";}
}
