#include <jni.h>
#include <atomic>
#include <algorithm>
#include <mutex>
#include <string>
#include <vector>
#include "llama.h"
#include "ggml-backend.h"
#include <dlfcn.h>
struct Engine { llama_model* model=nullptr; llama_context* ctx=nullptr; std::atomic<bool> cancelled{false}; std::string device; };
static void fail(JNIEnv* e,const char* s){e->ThrowNew(e->FindClass("java/io/IOException"),s);}
static std::string bytes(JNIEnv* e,jbyteArray a){std::string s(e->GetArrayLength(a),'\0');e->GetByteArrayRegion(a,0,s.size(),reinterpret_cast<jbyte*>(s.data()));return s;}
extern "C" JNIEXPORT jlong JNICALL Java_com_mcnex_conversation_LocalAi_load(JNIEnv* e,jclass,jstring p,jboolean gpu){
 static std::mutex init;std::lock_guard<std::mutex> guard(init);
 Dl_info location{};dladdr(reinterpret_cast<void*>(&Java_com_mcnex_conversation_LocalAi_load),&location);
 if(!location.dli_fname){fail(e,"Cannot locate native backend directory");return 0;}
 std::string dir=location.dli_fname;dir=dir.substr(0,dir.find_last_of('/'));
 if(!ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_CPU))ggml_backend_load((dir+"/libggml-cpu.so").c_str());
 if(!ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_CPU)){fail(e,"CPU backend unavailable");return 0;}
 if(gpu&&!ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU))ggml_backend_load((dir+"/libggml-opencl.so").c_str());
 if(gpu&&!ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU)){fail(e,"OpenCL GPU unavailable; select CPU in settings");return 0;}
 llama_backend_init();
 const char* path=e->GetStringUTFChars(p,nullptr);auto mp=llama_model_default_params();mp.n_gpu_layers=gpu?99:0;ggml_backend_dev_t devices[]={gpu?ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU):nullptr,nullptr};mp.devices=devices;
 auto* x=new Engine();x->device=gpu?ggml_backend_dev_description(devices[0]):"CPU";x->model=llama_model_load_from_file(path,mp);e->ReleaseStringUTFChars(p,path);
 if(!x->model){delete x;fail(e,"GGUF model load failed: unsupported or incomplete model");return 0;}
 const char* tmpl=llama_model_chat_template(x->model,nullptr);
 llama_chat_message check={"user","test"};char buf[1024];
 if(!tmpl||llama_chat_apply_template(tmpl,&check,1,true,buf,sizeof(buf))<0){llama_model_free(x->model);delete x;fail(e,"GGUF chat template missing or unsupported");return 0;}
 auto cp=llama_context_default_params();cp.n_ctx=4096;cp.n_batch=256;cp.n_ubatch=128;cp.n_threads=4;cp.n_threads_batch=4;cp.offload_kqv=gpu;cp.op_offload=gpu;
 x->ctx=llama_init_from_model(x->model,cp);
 if(!x->ctx){llama_model_free(x->model);delete x;fail(e,"GGUF context allocation failed");return 0;}
 llama_set_abort_callback(x->ctx,[](void* v){return static_cast<Engine*>(v)->cancelled.load();},x);return reinterpret_cast<jlong>(x);
}
extern "C" JNIEXPORT jbyteArray JNICALL Java_com_mcnex_conversation_LocalAi_generate(JNIEnv* e,jclass,jlong h,jbyteArray system,jbyteArray user,jint limit){
 auto* x=reinterpret_cast<Engine*>(h);if(!x){fail(e,"GGUF model not loaded");return nullptr;}
 x->cancelled=false;llama_memory_clear(llama_get_memory(x->ctx),true);
 std::string sys=bytes(e,system),usr=bytes(e,user);llama_chat_message chat[]={{"system",sys.c_str()},{"user",usr.c_str()}};
 const char* tmpl=llama_model_chat_template(x->model,nullptr);std::vector<char> formatted((sys.size()+usr.size())*2+4096);
 int n=llama_chat_apply_template(tmpl,chat,2,true,formatted.data(),formatted.size());
 if(n<0){fail(e,"Unsupported GGUF chat template");return nullptr;}
 if(n>static_cast<int>(formatted.size())){formatted.resize(n+1);n=llama_chat_apply_template(tmpl,chat,2,true,formatted.data(),formatted.size());}
 if(n<=0){fail(e,"GGUF prompt formatting failed");return nullptr;}
 auto* vocab=llama_model_get_vocab(x->model);std::vector<llama_token> tokens(4096);
 int count=llama_tokenize(vocab,formatted.data(),n,tokens.data(),tokens.size(),true,true);
 int max_tokens=std::max(1,std::min(1024,static_cast<int>(limit)));
 if(count<=0||count+max_tokens>static_cast<int>(llama_n_ctx(x->ctx))){fail(e,"GGUF prompt exceeds 4096 token context");return nullptr;}tokens.resize(count);
 for(int i=0;i<count;i+=256){auto batch=llama_batch_get_one(tokens.data()+i,std::min(256,count-i));if(llama_decode(x->ctx,batch)!=0){fail(e,x->cancelled?"Cancelled":"GGUF prompt processing failed");return nullptr;}}
 auto* sampler=llama_sampler_init_greedy();std::string out;
 for(int i=0;i<max_tokens&&!x->cancelled;i++){
  auto t=llama_sampler_sample(sampler,x->ctx,-1);if(llama_vocab_is_eog(vocab,t))break;
  std::vector<char> piece(512);int size=llama_token_to_piece(vocab,t,piece.data(),piece.size(),0,false);
  if(size<0){piece.resize(-size);size=llama_token_to_piece(vocab,t,piece.data(),piece.size(),0,false);}if(size>0)out.append(piece.data(),size);
  auto batch=llama_batch_get_one(&t,1);if(llama_decode(x->ctx,batch)!=0){llama_sampler_free(sampler);fail(e,x->cancelled?"Cancelled":"GGUF generation failed");return nullptr;}
 }
 llama_sampler_free(sampler);if(x->cancelled){fail(e,"Cancelled");return nullptr;}
 auto result=e->NewByteArray(out.size());e->SetByteArrayRegion(result,0,out.size(),reinterpret_cast<const jbyte*>(out.data()));return result;
}
extern "C" JNIEXPORT void JNICALL Java_com_mcnex_conversation_LocalAi_cancel(JNIEnv*,jclass,jlong h){if(h)reinterpret_cast<Engine*>(h)->cancelled=true;}
extern "C" JNIEXPORT void JNICALL Java_com_mcnex_conversation_LocalAi_free(JNIEnv*,jclass,jlong h){auto* x=reinterpret_cast<Engine*>(h);if(x){llama_free(x->ctx);llama_model_free(x->model);delete x;}}

extern "C" JNIEXPORT jstring JNICALL Java_com_mcnex_conversation_LocalAi_device(JNIEnv* e,jclass,jlong h){auto* x=reinterpret_cast<Engine*>(h);return e->NewStringUTF(x?x->device.c_str():"unloaded");}
