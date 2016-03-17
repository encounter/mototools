#!/bin/sh
TAG="android-4.1.2_r2.1"

if [ ! -d "src" ]; then
  git clone https://android.googlesource.com/platform/system/extras src
  cd src
else
  cd src
  git reset --hard HEAD
  git pull
fi
git checkout tags/$TAG

cd ext4_utils
gcc -o ../../simg2img -lz sparse_crc32.c simg2img.c

