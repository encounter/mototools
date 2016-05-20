#!/bin/bash -ex
BRANCH=android-5.1.1_r24

if [ ! -d "src" ]; then
  mkdir -p src
  cd src

  git clone --depth 1 -b $BRANCH https://android.googlesource.com/platform/system/core
  git clone --depth 1 -b $BRANCH https://android.googlesource.com/platform/external/bzip2
  git clone --depth 1 -b $BRANCH https://android.googlesource.com/platform/external/zlib
  patch -d zlib -p1 < ../patches/zlib.patch
  git clone --depth 1 -b $BRANCH https://android.googlesource.com/platform/bootable/recovery
  patch -d recovery -p1 < ../patches/recovery.patch
else
  cd src
fi

cd zlib/src
gcc -O3 -DUSE_MMAP -I.. \
    -c adler32.c compress.c crc32.c deflate.c gzclose.c gzlib.c gzread.c \
       gzwrite.c infback.c inflate.c inftrees.c inffast.c trees.c uncompr.c \
       zutil.c
ar rcs libz.a *.o
cd ../..

cd bzip2
gcc -O3 -DUSE_MMAP \
    -c blocksort.c huffman.c crctable.c randtable.c compress.c decompress.c bzlib.c
ar rcs libbz.a *.o
cd ..

cd core/libmincrypt
gcc -c rsa.c sha.c sha256.c -I ../include
ar rcs libmincrypt.a *.o
cd ../..

cd recovery/applypatch
gcc -I ../../core/include -I .. \
    -I ../../bzip2 -o applypatch \
    main.c applypatch.c bsdiff.c imgpatch.c utils.c bspatch.c \
    ../../core/libmincrypt/libmincrypt.a \
    ../../zlib/src/libz.a \
    ../../bzip2/libbz.a
cp applypatch ../../..
cd ../..

