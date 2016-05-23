#!/bin/bash -e
TAG="android-6.0.1_r43"

mkdir -p lib out
LIB_DIR="$(readlink -f lib)"
OUT_DIR="$(readlink -f out)"
SPARSE_DIR="$(readlink -f ../libsparse)"
SPARSE_LIB_DIR="$SPARSE_DIR/lib"
SPARSE_INCLUDE_DIR="$SPARSE_DIR/src/libsparse/include"
if [ ! -d "$SPARSE_LIB_DIR" ]; then
  echo "Build libsparse first" >&2
  exit 1
fi

if [ ! -d "src" ]; then
  git clone --depth 1 https://android.googlesource.com/platform/system/extras src
fi
cd src
git checkout tags/$TAG

cd ext4_utils
#LIB_FLAGS="-lz -Iinclude output_file.c sparse.c sparse_crc32.c sparse_err.c backed_block.c sparse_read.c"
lib_files="make_ext4fs.c ext4fixup.c ext4_utils.c allocate.c contents.c extent.c indirect.c sha1.c wipe.c crc16.c ext4_sb.c"
gcc -o "$LIB_DIR/libext4_utils.so" -shared -fPIC -lz -lselinux -I"$SPARSE_DIR/src/include" -I"$SPARSE_INCLUDE_DIR" $lib_files
gcc -o "$OUT_DIR/ext2simg" -lz -I"$SPARSE_INCLUDE_DIR" "$SPARSE_LIB_DIR/libsparse.so" \
  "$LIB_DIR/libext4_utils.so" ext2simg.c
