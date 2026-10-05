"""Integration tests for the dependency-free GLB postprocessor."""
import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("postprocess_glb.py")

def make_glb(path):
    binary = struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 0)
    document = {
        "asset": {"version": "2.0"},
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(binary), "target": 34962}],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3", "min": [0, 0, 0], "max": [1, 1, 0]}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
        "nodes": [{"mesh": 0}],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
    }
    raw_json = json.dumps(document, separators=(",", ":")).encode("utf-8")
    raw_json += b" " * ((4 - len(raw_json) % 4) % 4)
    binary += b"\0" * ((4 - len(binary) % 4) % 4)
    chunks = (
        struct.pack("<I4s", len(raw_json), b"JSON") + raw_json
        + struct.pack("<I4s", len(binary), b"BIN\0") + binary
    )
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + len(chunks)) + chunks)

def read_glb_json(path):
    data = path.read_bytes()
    declared = struct.unpack_from("<I", data, 8)[0]
    length, kind = struct.unpack_from("<I4s", data, 12)
    if data[:4] != b"glTF" or declared != len(data) or kind != b"JSON":
        raise AssertionError("El resultado no es un GLB 2.0 completo.")
    return json.loads(data[20:20 + length].decode("utf-8").rstrip())

class PostprocessGlbTests(unittest.TestCase):
    def test_color_is_added_when_source_mesh_has_no_material(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "input.glb"
            output = Path(directory) / "output.glb"
            make_glb(source)
            subprocess.run(
                [sys.executable, str(SCRIPT), str(source), str(output),
                 "--color", "#ff0000", "--motion", "idle_sway"],
                check=True,
            )
            document = read_glb_json(output)
            self.assertEqual(
                document["materials"][0]["pbrMetallicRoughness"]["baseColorFactor"],
                [1.0, 0.0, 0.0, 1.0],
            )
            self.assertEqual(document["meshes"][0]["primitives"][0]["material"], 0)
            self.assertEqual(document["animations"][0]["name"], "Balanceo suave")
            self.assertEqual(document["scenes"][0]["nodes"], [1])

if __name__ == "__main__":
    unittest.main()
