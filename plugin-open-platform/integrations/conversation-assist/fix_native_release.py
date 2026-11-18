from pathlib import Path
p=Path('integrations/conversation-assist/android/src/com/mcnex/conversation/AssistService.java');s=p.read_text(encoding='utf-8').replace('if(whisper!=null)whisper.cancel();clients.shutdownNow();','if(whisper!=null)whisper.cancel();if(liveSpeech!=null)liveSpeech.close();clients.shutdownNow();');p.write_text(s,encoding='utf-8')
