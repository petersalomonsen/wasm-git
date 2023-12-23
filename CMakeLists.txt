project(wasm-git)
cmake_minimum_required(VERSION 3.0)
add_subdirectory(libgit2)
set_target_properties(lg2 PROPERTIES OUTPUT_NAME $ENV{LG2_OUTPUT_NAME})
