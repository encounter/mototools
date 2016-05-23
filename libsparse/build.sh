#!/bin/bash -e
TAG="android-6.0.1_r43"

mkdir -p lib
mkdir -p out
LIB_DIR="$(readlink -f lib)"
OUT_DIR="$(readlink -f out)"

if [ ! -d "src" ]; then
  git clone --depth 1 https://android.googlesource.com/platform/system/core src
fi
cd src
git checkout tags/$TAG

cd libsparse
gcc -o "$LIB_DIR/libsparse.so" -shared -fPIC -lz -Iinclude output_file.c \
  sparse.c sparse_crc32.c sparse_err.c backed_block.c sparse_read.c
LIB_FLAGS="-Iinclude $LIB_DIR/libsparse.so"
gcc -o "$OUT_DIR/simg2img" $LIB_FLAGS simg2img.c
gcc -o "$OUT_DIR/img2simg" $LIB_FLAGS img2simg.c
gcc -o "$OUT_DIR/simg2simg" $LIB_FLAGS simg2simg.c
