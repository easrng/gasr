#!/usr/bin/env python3
import sys
import ctypes
import struct

CALLBACK = ctypes.CFUNCTYPE(
    None, ctypes.POINTER(ctypes.c_byte), ctypes.c_int, ctypes.c_void_p
)


class SodaConfig(ctypes.Structure):
    _fields_ = [
        ("soda_config", ctypes.c_char_p),
        ("soda_config_size", ctypes.c_int),
        ("callback", CALLBACK),
        ("callback_handle", ctypes.c_void_p),
    ]


def read_big_endian_uint32():
    buffer = sys.stdin.buffer.read(4)
    value = (buffer[0] << 24) | (buffer[1] << 16) | (buffer[2] << 8) | buffer[3]
    return value


def write_big_endian_uint32(value):
    buffer = bytearray()
    buffer.append((value >> 24) & 0xFF)
    buffer.append((value >> 16) & 0xFF)
    buffer.append((value >> 8) & 0xFF)
    buffer.append(value & 0xFF)
    sys.stdout.buffer.write(buffer)


class SodaClient:
    def __init__(self, callback=None):
        self.sodalib = ctypes.CDLL("./libsoda.so")
        if callback == None:
            callback = CALLBACK(self.resultHandler)
        else:
            callback = CALLBACK(callback)
        size = read_big_endian_uint32()
        cfg_serialized = sys.stdin.buffer.read(size)
        self.config = SodaConfig(cfg_serialized, size, callback, None)
        self.sodalib.CreateExtendedSodaAsync.restype = ctypes.c_void_p

    def start(self):
        self.handle = ctypes.c_void_p(self.sodalib.CreateExtendedSodaAsync(self.config))
        self.sodalib.ExtendedSodaStart(self.handle)
        while True:
            size = read_big_endian_uint32()
            audio = sys.stdin.buffer.read(size)
            self.sodalib.ExtendedAddAudio(self.handle, audio, size)

    def delete(self):
        self.sodalib.DeleteExtendedSodaAsync(self.handle)

    def resultHandler(self, response, rlen, instance):
        write_big_endian_uint32(rlen)
        sys.stdout.buffer.write(ctypes.string_at(response, rlen))


if __name__ == "__main__":
    client = SodaClient()
    try:
        client.start()
    except KeyboardInterrupt:
        client.delete()
