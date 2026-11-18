from pathlib import Path
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/MainActivity.java');s=p.read_text(encoding='utf-8')
s=s.replace('private ScrollView homeScroll;', 'private ScrollView homeScroll;private EditText meetingSearch;')
s=s.replace('bars.bottom+dp(12));return insets;', 'Math.max(bars.bottom,insets.getInsets(WindowInsets.Type.ime()).bottom)+dp(12));if(insets.isVisible(WindowInsets.Type.ime()))v.post(this::revealSearch);return insets;')
s=s.replace('super.onCreate(saved);getWindow().setStatusBarColor', 'super.onCreate(saved);getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);getWindow().setStatusBarColor')
s=s.replace('EditText search=new EditText(this);search.setSingleLine', 'EditText search=new EditText(this);meetingSearch=search;search.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH);search.setOnFocusChangeListener((v,focused)->{if(focused)v.post(this::revealSearch);});homeScroll.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{if(b-t!=ob-ot)v.post(this::revealSearch);});search.setSingleLine')
s=s.replace('homeScroll.post(()->homeScroll.scrollTo(0,scroll));', 'homeScroll.post(()->{if(meetingSearch!=null&&meetingSearch.hasFocus())revealSearch();else homeScroll.scrollTo(0,scroll);});')
pos=s.index(' void pickDate()')
s=s[:pos]+''' // Keep the focused field visible after IME resizing and asynchronous result relayout.
 void revealSearch(){if(detailId!=null||homeScroll==null||meetingSearch==null||!meetingSearch.hasFocus()||!meetingSearch.isAttachedToWindow())return;android.graphics.Rect area=new android.graphics.Rect();meetingSearch.getDrawingRect(area);area.top-=dp(12);area.bottom+=dp(12);meetingSearch.requestRectangleOnScreen(area,true);}
'''+s[pos:]
p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/AndroidManifest.xml');s=p.read_text(encoding='utf-8').replace('android:name=".MainActivity" android:exported="true"','android:name=".MainActivity" android:exported="true" android:windowSoftInputMode="adjustResize"');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/build.gradle');s=p.read_text(encoding='utf-8').replace("versionCode 8; versionName '0.6.0'","versionCode 9; versionName '0.6.1'");p.write_text(s,encoding='utf-8')
