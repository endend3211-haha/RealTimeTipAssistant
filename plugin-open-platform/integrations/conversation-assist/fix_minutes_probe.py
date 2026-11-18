from pathlib import Path
p=Path('integrations/conversation-assist/android/debug/MinutesUiProbe.java');s=p.read_text(encoding='utf-8').replace('a.screen();TextView','a.screen();LinearLayout page=(LinearLayout)((android.view.ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0);TextView').replace('a.root.addView','page.addView');p.write_text(s,encoding='utf-8')
