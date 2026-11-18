from pathlib import Path
p=Path('integrations/conversation-assist/android/native/CMakeLists.txt');s=p.read_text(encoding='utf-8').replace('add_subdirectory(llama.cpp)','''# Apply to every shared/module target, including dynamic ggml backends.
add_link_options("-Wl,-z,max-page-size=16384" "-Wl,-z,common-page-size=16384")
add_subdirectory(llama.cpp)''');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/build.gradle');s=p.read_text(encoding='utf-8').replace("versionCode 11; versionName '0.8.0'","versionCode 12; versionName '0.8.1'");p.write_text(s,encoding='utf-8')
