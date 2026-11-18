from pathlib import Path
import xml.etree.ElementTree as E
for name in ['trash-2','share-2']:
 svg=E.fromstring(Path('integrations/conversation-assist/document-icons',name+'.svg').read_text());paths=[]
 for elem in svg:
  tag=elem.tag.split('}')[-1];a=elem.attrib;d=None
  if tag=='path':d=a['d']
  elif tag=='line':d=f"M{a['x1']},{a['y1']} L{a['x2']},{a['y2']}"
  elif tag=='polyline':d='M'+a['points'].strip().replace(' ', ' L',1) if False else 'M'+' L'.join(a['points'].split())
  elif tag=='circle':
   cx,cy,r=map(float,[a['cx'],a['cy'],a['r']]);d=f'M{cx-r},{cy} a{r},{r} 0,1 0 {r*2},0 a{r},{r} 0,1 0 {-r*2},0'
  if d:paths.append('<path android:pathData="'+d+'" android:fillColor="@android:color/transparent" android:strokeColor="#11302A" android:strokeWidth="2" android:strokeLineCap="round" android:strokeLineJoin="round"/>')
 xml='<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">'+''.join(paths)+'</vector>'
 Path('integrations/conversation-assist/android/res/drawable',name.replace('-','_')+'.xml').write_text(xml,encoding='utf-8')
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/SwipeMeetingCard.java');s=p.read_text(encoding='utf-8').replace('Button action=new Button(c);action.setAllCaps(false);actions.addView(action,new LinearLayout.LayoutParams(distance,-1));','ImageButton action=new ImageButton(c);int iconSize=(int)(52*c.getResources().getDisplayMetrics().density);LinearLayout.LayoutParams iconLp=new LinearLayout.LayoutParams(iconSize,iconSize);iconLp.setMargins((distance-iconSize)/2,0,(distance-iconSize)/2,0);action.setPadding(iconSize/4,iconSize/4,iconSize/4,iconSize/4);action.setScaleType(ImageView.ScaleType.CENTER_INSIDE);actions.addView(action,iconLp);')
s=s.replace('Button button=(Button)getTag();button.setText(direction<0?"삭제":"공유");button.setTextColor(direction<0?0xffa33232:0xff11302a);','ImageButton button=(ImageButton)getTag();style(button,direction);')
s=s.replace('Button button=(Button)getTag();int direction=card.getTranslationX()<0?-1:1;button.setText(direction<0?"삭제":"공유");','ImageButton button=(ImageButton)getTag();int direction=card.getTranslationX()<0?-1:1;style(button,direction);')
pos=s.index(' private void show(');s=s[:pos]+''' private void style(ImageButton button,int direction){button.setImageResource(direction<0?R.drawable.trash_2:R.drawable.share_2);button.setColorFilter(direction<0?0xffa33232:0xff11302a);android.graphics.drawable.GradientDrawable background=new android.graphics.drawable.GradientDrawable();background.setShape(android.graphics.drawable.GradientDrawable.OVAL);background.setColor(direction<0?0xfff8dfdc:0xffcfef8d);button.setBackground(background);button.setContentDescription(direction<0?"회의 기록 삭제":"회의록 공유 앱 선택");}
'''+s[pos:];p.write_text(s,encoding='utf-8')
