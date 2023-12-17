#!/bin/bash

curl -L https://github.com/libgit2/libgit2/archive/refs/tags/v1.7.1.tar.gz --output libgit2.tar.gz
tar -xzf libgit2.tar.gz
mv libgit2-1.7.1 libgit2
rm libgit2.tar.gz
rm libgit2/src/libgit2/transports/http.c
rm libgit2/src/libgit2/streams/socket.c

cp -r libgit2patchedfiles/examples/* libgit2/examples/
