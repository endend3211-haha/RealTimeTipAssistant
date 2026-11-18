cmake_minimum_required(VERSION 3.22.1)

project("llama-bridge")

add_library(
    llama-bridge
    SHARED
    llama-bridge.cpp
)

find_library(
    log-lib
    log
)

target_link_libraries(
    llama-bridge
    ${log-lib}
)

# Enforce 16KB ELF page size alignment for Android 15+ (API 35/36/37) compatibility
target_link_options(
    llama-bridge
    PRIVATE
    "-Wl,-z,max-page-size=16384"
)
