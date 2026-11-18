from pathlib import Path
import shutil
r=Path('integrations/conversation-assist/android/whisper-native');r.mkdir(exist_ok=True)
source=Path('C:/Users/MCNEX/Desktop/HI/MemoMessengerCompanion/work/android/app/src/main/cpp')
s=(source/'memo-whisper.cpp').read_text(encoding='utf-8').replace('WHISPER_SAMPLING_BEAM_SEARCH','WHISPER_SAMPLING_GREEDY').replace('params.beam_search.beam_size=5;','params.greedy.best_of=1;params.single_segment=true;params.max_tokens=64;')
(r/'memo-whisper.cpp').write_text(s,encoding='utf-8')
s=(source/'CMakeLists.txt').read_text(encoding='utf-8').replace('add_subdirectory(vendor/whisper.cpp-1.9.5 whisper-build)','add_subdirectory("'+(source/'vendor/whisper.cpp-1.9.5').as_posix()+'" whisper-build)')
s=s.replace('"-Wl,-z,max-page-size=16384"', '"-Wl,-Bsymbolic" "-Wl,--exclude-libs,ALL" "-Wl,-z,max-page-size=16384"')
(r/'CMakeLists.txt').write_text(s,encoding='utf-8')
