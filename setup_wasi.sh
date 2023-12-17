#!/bin/bash

curl -L https://github.com/libgit2/libgit2/archive/refs/tags/v1.7.1.tar.gz --output libgit2.tar.gz
tar -xzf libgit2.tar.gz
mv libgit2-1.7.1 libgit2
rm libgit2.tar.gz
