"""Validate Forge Command PNG icons with Python standard library."""
from pathlib import Path
import struct
import zlib

for size in (180, 192, 512):
    path = Path(f"assets/icon-{size}.png")
    data = path.read_bytes()
    assert data.startswith(b"\x89PNG\r\n\x1a\n"), f"{path}: bad PNG signature"
    pos = 8
    idat = bytearray()
    dimensions = None
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        payload = data[pos + 8:pos + 8 + length]
        stored_crc = struct.unpack(">I", data[pos + 8 + length:pos + 12 + length])[0]
        actual_crc = zlib.crc32(kind + payload) & 0xFFFFFFFF
        assert stored_crc == actual_crc, f"{path}: CRC mismatch in {kind}"
        if kind == b"IHDR":
            dimensions = struct.unpack(">II", payload[:8])
            assert dimensions == (size, size), f"{path}: wrong dimensions {dimensions}"
        elif kind == b"IDAT":
            idat.extend(payload)
        elif kind == b"IEND":
            break
        pos += 12 + length
    raw = zlib.decompress(bytes(idat))
    assert len(raw) == size * (size + 1), f"{path}: unexpected decompressed length"
    assert all(raw[i * (size + 1)] == 0 for i in range(size)), f"{path}: bad row filters"
    assert len(set(raw)) > 4, f"{path}: suspiciously empty icon"
    print(f"{path}: {dimensions}, CRCs verified")
