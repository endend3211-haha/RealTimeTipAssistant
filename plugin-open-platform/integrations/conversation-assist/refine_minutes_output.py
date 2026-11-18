from pathlib import Path
r=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
p=r/'LiteAi.java';s=p.read_text(encoding='utf-8').replace('null,null,2048,null,cache','null,null,4096,null,cache');p.write_text(s,encoding='utf-8')
p=r/'MeetingManager.java';s=p.read_text(encoding='utf-8').replace('source.get(i),190','source.get(i),384').replace('groups.get(i),128','groups.get(i),192').replace('reduced),400','reduced),900')
needle='else{activeId=null;store.active(null);}}}'
replacement='else{activeId=null;store.active(null);}}JSONArray prior=store.list();for(int i=0;i<prior.length();i++){JSONObject m=prior.getJSONObject(i);String state=m.optString("minutesStatus");if(state.equals("queued")||state.equals("generating")){m.put("minutesStatus","interrupted").put("minutesProgress","앱이 중단되었습니다. 다시 생성할 수 있습니다");store.writeMeta(m.getString("id"),m);}}}'
assert needle in s;s=s.replace(needle,replacement);p.write_text(s,encoding='utf-8')
p=r/'MainActivity.java';s=p.read_text(encoding='utf-8').replace('homeScroll.setFillViewport(false);','homeScroll.setFillViewport(false);homeScroll.setFocusableInTouchMode(true);homeScroll.setDescendantFocusability(ViewGroup.FOCUS_BEFORE_DESCENDANTS);')
s=s.replace('document.setText(shown);','document.setText(tab==1?formatted(shown):shown);')
idx=s.index(' void refresh(){');s=s[:idx]+''' CharSequence formatted(String value){android.text.SpannableStringBuilder out=new android.text.SpannableStringBuilder();for(String line:value.split("\\n",-1)){int start=out.length();boolean heading=line.startsWith("#")||line.startsWith("===")||(line.startsWith("**")&&line.endsWith("**"))||line.startsWith("회의록 —");String clean=line.replaceAll("^#{1,6}\\\\s+","").replace("**","").replaceAll("^\\\\*\\\\s+","• ").replace("===","").trim();out.append(clean).append("\\n");if(heading&&out.length()>start){out.setSpan(new android.text.style.StyleSpan(Typeface.BOLD),start,out.length(),android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);out.setSpan(new android.text.style.RelativeSizeSpan(1.1f),start,out.length(),android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);}}return out;}
''' +s[idx:]
p.write_text(s,encoding='utf-8')
