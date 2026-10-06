#!/usr/bin/env python3
"""Patch the four global lerp overloads that conflict with C++20 std::lerp."""

from pathlib import Path
import re
import sys


DECLARATION = re.compile(
    r"(?m)^(inline __device__ __host__ float(?:[234])?) lerp\("
)
PATCHED_DECLARATION = re.compile(
    r"(?m)^inline __device__ __host__ float(?:[234])? mc_lerp\("
)
BEARER_TOKEN = re.compile(r"(?i)(authorization\s*:\s*bearer\s+)\S+")
SIGNED_URL = re.compile(r"(?i)(https?://[^\s?#]+)\?[^\s]+")


def patch_header(source: str) -> str:
    patched, replacements = DECLARATION.subn(r"\1 mc_lerp(", source)
    if replacements == 4:
        return patched
    if replacements == 0 and PATCHED_DECLARATION.search(source):
        return source
    raise ValueError("unrecognized torchmcubes helper_math.h")


def patch_file(path: Path) -> bool:
    source = path.read_text(encoding="utf-8")
    patched = patch_header(source)
    if patched == source:
        return False
    path.write_text(patched, encoding="utf-8")
    return True


def sanitize_diagnostic(text: str) -> str:
    text = BEARER_TOKEN.sub(r"\1[redacted]", text)
    text = SIGNED_URL.sub(r"\1?[redacted]", text)
    return "\n".join(text.splitlines()[-18:])[-1600:]


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--diagnostic":
        try:
            print(sanitize_diagnostic(Path(sys.argv[2]).read_text(encoding="utf-8", errors="replace")))
        except OSError as exc:
            raise SystemExit(str(exc)) from exc
        raise SystemExit(0)
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_torchmcubes_cxx20.py PATH_TO_HELPER_MATH_H | --diagnostic BUILD_LOG")
    try:
        changed = patch_file(Path(sys.argv[1]))
    except (OSError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
    print("patched torchmcubes helper_math.h" if changed else "torchmcubes patch already present")
