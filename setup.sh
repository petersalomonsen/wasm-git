curl https://codeload.github.com/libgit2/libgit2/tar.gz/v0.99.0 --output libgit2.tar.gz
tar -xvzf libgit2.tar.gz
mv libgit2-0.99.0 libgit2
rm libgit2.tar.gz
rm libgit2/src/transports/http.c
cp -r libgit2patchedfiles/* libgit2/