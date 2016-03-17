from sys import exit, argv
from struct import *

if len(argv) == 1:
  print('Input file not specified')
  exit(1)

HEADER_SIZE = 1024
SECTOR_SIZE = 512
MAX_ENTRIES = 20
MAGIC = b'MBOOTV1\0'

in_file = open(argv[1], 'rb')

entry_count_fmt = '<I'
entry_count_size = calcsize(entry_count_fmt)
entry_count, = unpack(entry_count_fmt, in_file.read(entry_count_size))
if entry_count == 0 or entry_count > MAX_ENTRIES:
  print('Invalid input file')
  exit(1)

entry_info_fmt = '<24sII'
entry_info_size = calcsize(entry_info_fmt)
entries = [unpack(entry_info_fmt, in_file.read(entry_info_size)) for i in range(entry_count)]

magic_fmt = '<8s'
magic_size = calcsize(magic_fmt)
magic_start = (MAX_ENTRIES * entry_info_size) + entry_count_size
in_file.seek(magic_start)
magic, = unpack(magic_fmt, in_file.read(magic_size))
if magic != MAGIC:
  print('Invalid input file')
  exit(1)

signature_size = HEADER_SIZE - magic_start - magic_size
out_filename = 'moto.sig'
out_file = open(out_filename, 'wb')
print('Writing ' + out_filename)
out_file.write(in_file.read(signature_size))
out_file.close()

def to_str(bytes):
  return bytes.decode('ascii').rstrip('\0')

for entry in entries:
  out_filename = to_str(entry[0]) + '.bin'
  out_file = open(out_filename, 'wb')
  print('Writing ' + out_filename)

  start_offset = entry[1] * SECTOR_SIZE
  image_size = ((entry[2] + 1) * SECTOR_SIZE) - start_offset
  in_file.seek(start_offset + HEADER_SIZE)
  out_file.write(in_file.read(image_size))
  out_file.close()
  
print('Done!')
in_file.close()
