#!/usr/bin/env python3
"""Apply requested color and a lightweight baked animation to a GLB without extra libraries."""
import argparse
import json
import math
import struct
from pathlib import Path

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def parse_glb(data):
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("El resultado no es un GLB válido")
    magic, version, declared = struct.unpack_from("<4sII", data, 0)
    if version != 2 or declared > len(data):
        raise ValueError("Versión o longitud GLB inválida")
    chunks = []
    offset = 12
    while offset + 8 <= declared:
        length, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        if offset + length > declared:
            raise ValueError("Chunk GLB truncado")
        chunks.append([kind, bytearray(data[offset:offset + length])])
        offset += length
    doc_chunk = next((chunk for chunk in chunks if chunk[0] == JSON_CHUNK), None)
    if doc_chunk is None:
        raise ValueError("Falta el documento JSON del GLB")
    doc = json.loads(bytes(doc_chunk[1]).rstrip(b" \t\r\n\0").decode("utf-8"))
    bin_chunk = next((chunk for chunk in chunks if chunk[0] == BIN_CHUNK), None)
    if bin_chunk is None:
        bin_chunk = [BIN_CHUNK, bytearray()]
        chunks.append(bin_chunk)
    return doc, chunks, bin_chunk


def pack_glb(doc, chunks, bin_chunk, destination):
    doc.setdefault("buffers", [{}])
    doc["buffers"][0]["byteLength"] = len(bin_chunk[1])
    raw_json = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    raw_json += b" " * ((4 - len(raw_json) % 4) % 4)
    output = bytearray(b"glTF" + struct.pack("<II", 2, 0))
    ordered = [[JSON_CHUNK, bytearray(raw_json)]] + [c for c in chunks if c[0] != JSON_CHUNK]
    for kind, payload in ordered:
        pad = (4 - len(payload) % 4) % 4
        if pad and kind == BIN_CHUNK:
            payload.extend(b"\0" * pad)
        output.extend(struct.pack("<II", len(payload), kind))
        output.extend(payload)
    struct.pack_into("<I", output, 8, len(output))
    Path(destination).write_bytes(output)


def color_rgba(value):
    value = (value or "#ffffff").strip().lstrip("#")
    if len(value) != 6 or any(c not in "0123456789abcdefABCDEF" for c in value):
        raise ValueError("El color debe ser un valor hexadecimal de seis dígitos")
    return [int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4)] + [1.0]


def append_accessor(doc, binary, values, accessor_type, count, minimum=None, maximum=None):
    binary.extend(b"\0" * ((4 - len(binary) % 4) % 4))
    offset = len(binary)
    packed = struct.pack("<" + "f" * len(values), *values)
    binary.extend(packed)
    view_index = len(doc.setdefault("bufferViews", []))
    doc["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": len(packed)})
    accessor = {"bufferView": view_index, "componentType": 5126, "count": count, "type": accessor_type}
    if minimum is not None:
        accessor["min"] = minimum
    if maximum is not None:
        accessor["max"] = maximum
    index = len(doc.setdefault("accessors", []))
    doc["accessors"].append(accessor)
    return index


def bake_motion(doc, binary, preset):
    if preset not in ("idle_sway", "turntable"):
        return
    scenes = doc.setdefault("scenes", [{"nodes": []}])
    scene_index = int(doc.get("scene", 0))
    if scene_index >= len(scenes):
        scene_index = 0
    scene = scenes[scene_index]
    roots = list(scene.get("nodes") or [])
    if not roots:
        raise ValueError("El GLB no tiene nodos de escena para animar")
    nodes = doc.setdefault("nodes", [])
    wrapper_index = len(nodes)
    nodes.append({"name": "EditorMotionRoot", "children": roots})
    scene["nodes"] = [wrapper_index]

    times = append_accessor(doc, binary, [0.0, 1.0, 2.0], "SCALAR", 3, [0.0], [2.0])
    if preset == "turntable":
        # Full turn in two seconds. The last quaternion is the negated identity,
        # which is equivalent to identity and keeps the interpolation continuous.
        rotations = [0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, -1.0]
        name = "Giro continuo"
    else:
        angle = math.radians(7.0)
        half = angle / 2.0
        rotations = [0.0, 0.0, -math.sin(half), math.cos(half),
                     0.0, 0.0, math.sin(half), math.cos(half),
                     0.0, 0.0, -math.sin(half), math.cos(half)]
        name = "Balanceo suave"
    output = append_accessor(doc, binary, rotations, "VEC4", 3, [-1.0, -1.0, -1.0, -1.0], [1.0, 1.0, 1.0, 1.0])
    animation = {
        "name": name,
        "samplers": [{"input": times, "output": output, "interpolation": "LINEAR"}],
        "channels": [{"sampler": 0, "target": {"node": wrapper_index, "path": "rotation"}}],
    }
    doc.setdefault("animations", []).append(animation)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("destination")
    parser.add_argument("--color", default="#ffffff")
    parser.add_argument("--motion", default="none", choices=["none", "idle_sway", "turntable"])
    args = parser.parse_args()
    doc, chunks, bin_chunk = parse_glb(Path(args.source).read_bytes())
    tint = color_rgba(args.color)
    for material in doc.get("materials", []):
        pbr = material.setdefault("pbrMetallicRoughness", {})
        pbr["baseColorFactor"] = tint
    bake_motion(doc, bin_chunk[1], args.motion)
    pack_glb(doc, chunks, bin_chunk, args.destination)


if __name__ == "__main__":
    main()
