#include <jni.h>
#include <atomic>
#include <string>
#include <vector>
#include <memory>
#include "whisper.h"

struct Engine { whisper_context *context=nullptr;std::atomic<bool> aborted{false}; };
static void error(JNIEnv* env,const char* text){env->ThrowNew(env->FindClass("java/io/IOException"),text);}
extern "C" JNIEXPORT jlong JNICALL Java_com_memomind_companion_WhisperEngine_nativeLoad(JNIEnv* env,jclass,jstring path){
    const char* chars=env->GetStringUTFChars(path,nullptr);
    auto params=whisper_context_default_params();params.use_gpu=false;
    auto engine=std::make_unique<Engine>();engine->context=whisper_init_from_file_with_params(chars,params);
    env->ReleaseStringUTFChars(path,chars);
    if(!engine->context)return 0;return reinterpret_cast<jlong>(engine.release());
}
extern "C" JNIEXPORT jbyteArray JNICALL Java_com_memomind_companion_WhisperEngine_nativeTranscribe(JNIEnv* env,jclass,jlong handle,jfloatArray input,jint threads){
    auto* engine=reinterpret_cast<Engine*>(handle);
    if(!engine||!engine->context){error(env,"Whisper context missing");return nullptr;}
    const int size=env->GetArrayLength(input);
    if(size<1600||size>16000*31){error(env,"Invalid audio duration");return nullptr;}
    std::vector<float> audio(size);env->GetFloatArrayRegion(input,0,size,audio.data());
    if(env->ExceptionCheck())return nullptr;
    engine->aborted=false;
    auto params=whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads=threads;params.language="ko";params.detect_language=false;params.translate=false;
    params.no_context=true;params.no_timestamps=true;params.print_progress=false;params.print_realtime=false;
    params.print_timestamps=false;params.print_special=false;
    params.greedy.best_of=1;params.single_segment=true;params.max_tokens=64;params.temperature=0.0f;params.temperature_inc=0.0f;
    params.suppress_blank=true;params.suppress_nst=true;
    params.abort_callback=[](void* p){return static_cast<Engine*>(p)->aborted.load();};params.abort_callback_user_data=engine;
    int result=whisper_full(engine->context,params,audio.data(),size);
    if(result!=0||engine->aborted){error(env,engine->aborted?"Recognition cancelled":"Whisper recognition failed");return nullptr;}
    std::string text;
    for(int i=0;i<whisper_full_n_segments(engine->context);i++){
        const char* part=whisper_full_get_segment_text(engine->context,i);if(part)text+=part;
    }
    jbyteArray out=env->NewByteArray(static_cast<jsize>(text.size()));
    if(out)env->SetByteArrayRegion(out,0,static_cast<jsize>(text.size()),reinterpret_cast<const jbyte*>(text.data()));return out;
}
extern "C" JNIEXPORT void JNICALL Java_com_memomind_companion_WhisperEngine_nativeCancel(JNIEnv*,jclass,jlong handle){
    if(handle)reinterpret_cast<Engine*>(handle)->aborted=true;
}
extern "C" JNIEXPORT void JNICALL Java_com_memomind_companion_WhisperEngine_nativeFree(JNIEnv*,jclass,jlong handle){
    auto* engine=reinterpret_cast<Engine*>(handle);if(engine){whisper_free(engine->context);delete engine;}
}
