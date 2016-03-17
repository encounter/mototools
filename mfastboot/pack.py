from os.path import basename, getsize, splitext
from sys import exit, argv
from array import array
from struct import *
import math

def to_str(bytes):
  return bytes.decode('ascii').rstrip('\0')
  
def to_bytes(str):
  return str.encode('ascii')

if len(argv) < 3:
  print('Usage: '  + argv[0] + ' [input files...] [output file name]')
  exit(1)

HEADER_SIZE = 1024
SECTOR_SIZE = 512
MAX_ENTRIES = 20
MAGIC = b'MBOOTV1\0'

out_file = open(argv[-1], 'wb')

entry_count_fmt = '<I'
entry_count_size = calcsize(entry_count_fmt)
entry_count = len(argv) - 2
if entry_count > MAX_ENTRIES:
  print('Maximum of ' + str(MAX_ENTRIES) + ' entries')
  exit(1)
out_file.write(pack(entry_count_fmt, entry_count))

entry_info_fmt = '<24sII'
entry_info_size = calcsize(entry_info_fmt)
entries = []
total_entry_size = 0
for i in range(entry_count):
  in_filename = argv[i + 1]
  in_file_size = getsize(in_filename)
  entry_name = splitext(basename(in_filename))[0]
  entry_size = math.ceil(in_file_size / SECTOR_SIZE)
  entries.append([in_filename, in_file_size, entry_name, total_entry_size, entry_size])
  out_file.write(pack(entry_info_fmt, to_bytes(entry_name), total_entry_size, total_entry_size + entry_size - 1))
  total_entry_size += entry_size

magic_fmt = '<8s'
magic_size = calcsize(magic_fmt)
magic_start = (MAX_ENTRIES * entry_info_size) + entry_count_size
out_file.seek(magic_start)
out_file.write(pack(magic_fmt, MAGIC))

signature_size = HEADER_SIZE - magic_start - magic_size
in_filename = 'moto.sig'
in_file_size = getsize(in_filename)
if in_file_size != signature_size:
  print(in_filename + ' is wrong size')
  exit(1)
in_file = open(in_filename, 'rb')
out_file.write(in_file.read(signature_size))
in_file.close()

for entry in entries:
  in_file = open(entry[0], 'rb')
  in_file_size = entry[1]
  print('Writing ' + entry[2])
  out_file.seek((entry[3] * SECTOR_SIZE) + HEADER_SIZE)
  out_file.write(in_file.read(in_file_size))
  in_file.close()
  padding_byte_count = (entry[4] * SECTOR_SIZE) - in_file_size
  out_file.write(array('B', [255 for i in range(padding_byte_count)]).tostring()) # Should it really be padded with 0xFF or 0x00?

print('Done!')
out_file.close()
