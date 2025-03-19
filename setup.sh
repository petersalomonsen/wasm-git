#!/bin/bash

curl -L https://github.com/libgit2/libgit2/archive/refs/tags/v1.8.1.tar.gz --output libgit2.tar.gz
tar -xzf libgit2.tar.gz
mv libgit2-1.8.1 libgit2
rm libgit2.tar.gz
rm libgit2/src/libgit2/transports/http.c
cp -r libgit2patchedfiles/examples/* libgit2/examples/
cp -r libgit2patchedfiles/src/* libgit2/src/libgit2/
echo 'set(CMAKE_C90_STANDARD_COMPILE_OPTION "-std=gnu90")' >> libgit2/examples/CMakeLists.txt
echo 'set(CMAKE_C90_STANDARD_COMPILE_OPTION "-std=gnu90")' >> libgit2/src/libgit2/CMakeLists.txt
echo 'set(CMAKE_C90_STANDARD_COMPILE_OPTION "-std=gnu90")' >> libgit2/src/util/CMakeLists.txt
sed -i 's/GIT_PACK_FILE_MODE 0444/GIT_PACK_FILE_MODE 0644/g' libgit2/src/libgit2/pack.h
sed -i 's/GIT_OBJECT_FILE_MODE 0444/GIT_OBJECT_FILE_MODE 0644/g' libgit2/src/libgit2/odb.h
