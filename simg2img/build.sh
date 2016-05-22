#!/bin/sh
TAG="android-4.1.2_r2.1"

if [ ! -d "src" ]; then
  git clone --depth 1 https://android.googlesource.com/platform/system/extras src
  cd src
else
  cd src
  git reset --hard HEAD
  git pull
fi
git checkout tags/$TAG

cd ext4_utils
gcc -o ../../simg2img -lz sparse_crc32.c simg2img.c
gcc -o ../../img2simg -lz sparse_crc32.c img2simg.c
gcc -o ../../ext2simg -lz sparse_crc32.c backed_block.c \
  allocate.c extent.c wipe.c output_file.c sha1.c uuid.c \
  indirect.c ext4_utils.c ext2simg.c
