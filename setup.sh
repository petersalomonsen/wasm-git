curl -L https://github.com/libgit2/libgit2/archive/refs/tags/v1.3.0.tar.gz --output libgit2.tar.gz
tar -xzf libgit2.tar.gz
mv libgit2-1.3.0 libgit2
rm libgit2.tar.gz
rm libgit2/src/transports/http.c
cp -r libgit2patchedfiles/* libgit2/
# with NODEFS we can't open a file for writing if mode is set to 0444
sed -i 's/GIT_PACK_FILE_MODE 0444/GIT_PACK_FILE_MODE 0644/g' libgit2/src/pack.h
sed -i 's/GIT_OBJECT_FILE_MODE 0444/GIT_OBJECT_FILE_MODE 0644/g' libgit2/src/odb.h