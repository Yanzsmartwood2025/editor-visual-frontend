#!/usr/bin/env bash
set -euo pipefail

MANIFEST_URL="${1:?manifest URL required}"
WORKDIR="/tmp/nayla-triposr"
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"

python - "$MANIFEST_URL" "$WORKDIR/manifest.json" <<'PY'
import os
import sys
import urllib.request

url, destination = sys.argv[1], sys.argv[2]
request = urllib.request.Request(
    url,
    headers={"Authorization": "Bearer " + os.environ["NAYLA_GPU_CALLBACK_TOKEN"]},
)
with urllib.request.urlopen(request, timeout=30) as response:
    data = response.read()
with open(destination, "wb") as handle:
    handle.write(data)
PY

INPUT_URL="$(python - "$WORKDIR/manifest.json" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1]))
urls = manifest.get("inputUrls") or []
if len(urls) != 1:
    raise SystemExit("TripoSR requires exactly one input image")
print(urls[0])
PY
)"

OUTPUT_URL="$(python - "$WORKDIR/manifest.json" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1]))
output = manifest.get("output") or {}
url = output.get("uploadUrl")
if not url:
    raise SystemExit("Missing output upload URL")
print(url)
PY
)"

OUTPUT_TYPE="$(python - "$WORKDIR/manifest.json" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1]))
output = manifest.get("output") or {}
print(output.get("contentType") or "model/gltf-binary")
PY
)"

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends   git curl build-essential libgl1 libglib2.0-0
rm -rf /var/lib/apt/lists/*

git clone --depth 1 https://github.com/VAST-AI-Research/TripoSR.git "$WORKDIR/TripoSR"
cd "$WORKDIR/TripoSR"

python -m pip install --no-cache-dir --upgrade "setuptools>=69" wheel
python -m pip install --no-cache-dir -r requirements.txt

curl --fail --location --silent --show-error   "$INPUT_URL"   --output "$WORKDIR/input"

python run.py "$WORKDIR/input"   --output-dir "$WORKDIR/output"   --model-save-format glb   --mc-resolution 256

MODEL_PATH="$(find "$WORKDIR/output" -type f -name 'mesh.glb' -print -quit)"
if [ -z "$MODEL_PATH" ] || [ ! -s "$MODEL_PATH" ]; then
  echo "TripoSR did not produce a GLB output" >&2
  exit 20
fi

curl --fail --silent --show-error   --request PUT   --header "Content-Type: $OUTPUT_TYPE"   --upload-file "$MODEL_PATH"   "$OUTPUT_URL"
