TAG=android-6.0.1_r43

SRC_DIR=$(CURDIR)/src
LIB_DIR=$(CURDIR)/lib
OUT_DIR=$(CURDIR)/out
BINARIES=simg2img img2simg simg2simg ext2simg

all: $(BINARIES)

.ONESHELL:
simg2img img2simg simg2simg: $(SRC_DIR)/core $(LIB_DIR)/libsparse.so $(OUT_DIR)
	cd $</libsparse
	$(CC) -o $(OUT_DIR)/$@ -Iinclude $(LIB_DIR)/libsparse.so $@.c

ext2simg: $(SRC_DIR)/extras $(SRC_DIR)/core $(LIB_DIR)/libext4_utils.so $(OUT_DIR)
	cd $</ext4_utils
	$(CC) -o $(OUT_DIR)/$@ -lz -I$(SRC_DIR)/core/libsparse/include \
		$(LIB_DIR)/libsparse.so $(LIB_DIR)/libext4_utils.so $@.c

$(LIB_DIR)/libsparse.so: $(SRC_DIR)/core $(LIB_DIR)
	cd $</libsparse
	$(CC) -o $@ -shared -fPIC -lz -Iinclude output_file.c sparse.c \
		sparse_crc32.c sparse_err.c backed_block.c sparse_read.c

$(LIB_DIR)/libext4_utils.so: $(SRC_DIR)/extras $(SRC_DIR)/core
	cd $</ext4_utils
	$(CC) -o $@ -shared -fPIC -lz -lselinux -I$(SRC_DIR)/core/include \
		-I$(SRC_DIR)/core/libsparse/include make_ext4fs.c ext4fixup.c \
	   	ext4_utils.c allocate.c contents.c extent.c indirect.c sha1.c \
		wipe.c crc16.c ext4_sb.c

$(SRC_DIR)/core: $(SRC_DIR) FORCE
	[ ! -d $@ ] && git clone https://android.googlesource.com/platform/system/core $@
	git -C $@ checkout -fB $(TAG) tags/$(TAG)

$(SRC_DIR)/extras: $(SRC_DIR) FORCE
	[ ! -d $@ ] && git clone https://android.googlesource.com/platform/system/extras $@
	git -C $@ checkout -fB $(TAG) tags/$(TAG)

$(SRC_DIR) $(LIB_DIR) $(OUT_DIR):
	mkdir -p $@

clean:
	$(RM) -r $(OUT_DIR) $(LIB_DIR) $(SRC_DIR)

FORCE:
.PHONY: FORCE
