from pathlib import Path
p=Path('integrations/conversation-assist/android/native/CMakeLists.txt');s=p.read_text(encoding='utf-8').replace('set(BUILD_SHARED_LIBS OFF','set(BUILD_SHARED_LIBS ON').replace('set(GGML_BACKEND_DL OFF','set(GGML_BACKEND_DL ON');s=s.replace('add_subdirectory(llama.cpp)', '''set(GGML_OPENCL ON CACHE BOOL "" FORCE)
set(GGML_OPENCL_EMBED_KERNELS ON CACHE BOOL "" FORCE)
set(OpenCL_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../gpu-build/OpenCL-Headers" CACHE PATH "" FORCE)
set(OpenCL_LIBRARY "${CMAKE_CURRENT_SOURCE_DIR}/../../gpu-build/libOpenCL.so" CACHE FILEPATH "" FORCE)
set(Python3_EXECUTABLE "C:/Users/MCNEX/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" CACHE FILEPATH "" FORCE)
add_subdirectory(llama.cpp)''');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/native/conversation.cpp');s=p.read_text(encoding='utf-8').replace('#include "llama.h"','#include "llama.h"\n#include "ggml-backend.h"\n#include <dlfcn.h>')
s=s.replace('JNIEnv* e,jclass,jstring p){\n static std::once_flag once;std::call_once(once,[]{llama_backend_init();});', '''JNIEnv* e,jclass,jstring p,jboolean gpu){
 static std::mutex init;std::lock_guard<std::mutex> guard(init);
 Dl_info location{};dladdr(reinterpret_cast<void*>(&Java_com_mcnex_conversation_LocalAi_load),&location);
 if(!location.dli_fname){fail(e,"Cannot locate native backend directory");return 0;}
 std::string dir=location.dli_fname;dir=dir.substr(0,dir.find_last_of('/'));
 if(!ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_CPU))ggml_backend_load((dir+"/libggml-cpu.so").c_str());
 if(!ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_CPU)){fail(e,"CPU backend unavailable");return 0;}
 if(gpu&&!ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU))ggml_backend_load((dir+"/libggml-opencl.so").c_str());
 if(gpu&&!ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU)){fail(e,"OpenCL GPU unavailable; select CPU in settings");return 0;}
 llama_backend_init();''')
s=s.replace('mp.n_gpu_layers=0;', 'mp.n_gpu_layers=gpu?99:0;ggml_backend_dev_t devices[]={gpu?ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU):nullptr,nullptr};mp.devices=devices;')
s=s.replace('cp.n_threads_batch=4;', 'cp.n_threads_batch=4;cp.offload_kqv=gpu;cp.op_offload=gpu;')
p.write_text(s,encoding='utf-8')
b=Path('integrations/conversation-assist/android/src/com/mcnex/conversation')
p=b/'LocalAi.java';s=p.read_text(encoding='utf-8').replace('public LocalAi(File file)throws IOException{handle=load(file.getAbsolutePath());}', 'public LocalAi(File file)throws IOException{this(file,false);}\n public LocalAi(File file,boolean gpu)throws IOException{handle=load(file.getAbsolutePath(),gpu);}') .replace('load(String path)throws', 'load(String path,boolean gpu)throws');p.write_text(s,encoding='utf-8')
p=b/'MeetingManager.java';s=p.read_text(encoding='utf-8');s=s.replace(' String modelName(){',' String ggufBackend(){return context.getSharedPreferences("ai-models",0).getString("ggufBackend","cpu");}\n void selectBackend(String backend)throws Exception{if(!backend.equals("cpu")&&!backend.equals("opencl"))throw new IOException("지원하지 않는 GPU 모드");if(!AI_LOCK.tryLock())throw new IOException("AI 처리 완료 후 변경하세요");try{if(!queued.isEmpty())throw new IOException("회의록 완료 후 변경하세요");synchronized(this){if(selectedModel().equals("gguf")&&model!=null){model.close();model=null;}context.getSharedPreferences("ai-models",0).edit().putString("ggufBackend",backend).commit();}}finally{AI_LOCK.unlock();}}\n String modelName(){')
s=s.replace('?new LocalAi(file):new LiteAi', '?new LocalAi(file,ggufBackend().equals("opencl")):new LiteAi');p.write_text(s,encoding='utf-8')
p=b/'MainActivity.java';s=p.read_text(encoding='utf-8').replace('"선택 모델 응답 테스트"};new AlertDialog','"선택 모델 응답 테스트","GGUF 연산 장치 · CPU / GPU"};new AlertDialog');s=s.replace('}else testModel();}).setNegativeButton', '''}else if(item==2)testModel();else new AlertDialog.Builder(this).setTitle("GGUF 연산 장치").setSingleChoiceItems(new String[]{"CPU · 기본","GPU · OpenCL / Adreno"},manager.ggufBackend().equals("opencl")?1:0,(pick,index)->{pick.dismiss();new Thread(()->{try{manager.selectBackend(index==1?"opencl":"cpu");runOnUiThread(()->toast("GGUF 연산 장치를 변경했습니다"));}catch(Exception e){runOnUiThread(()->toast(e.getMessage()));}},"backend-select").start();}).setNegativeButton("닫기",null).show();}).setNegativeButton''')
s=s.replace('String name=m.modelName();String result=', 'String name=m.modelName()+(m.selectedModel().equals("gguf")?" / "+m.ggufBackend():"");String result=');p.write_text(s,encoding='utf-8')
p=Path('integrations/conversation-assist/android/build.gradle');s=p.read_text(encoding='utf-8').replace("versionCode 10; versionName '0.7.0'","versionCode 11; versionName '0.8.0'").replace('packaging { jniLibs { useLegacyPackaging=true } }','packaging { jniLibs { useLegacyPackaging=true; excludes += ["**/libOpenCL.so"] } }');p.write_text(s,encoding='utf-8')
