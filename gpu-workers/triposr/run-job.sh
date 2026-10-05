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

MODEL_NAME="$(python - "$WORKDIR/manifest.json" <<'PY'
import json, sys
options = json.load(open(sys.argv[1])).get("options") or {}
print(str(options.get("modelName") or "Modelo 3D")[:80])
PY
)"
BASE_COLOR="$(python - "$WORKDIR/manifest.json" <<'PY'
import json, sys, re
value = str((json.load(open(sys.argv[1])).get("options") or {}).get("baseColor") or "#ffffff")
print(value if re.fullmatch(r"#[0-9a-fA-F]{6}", value) else "#ffffff")
PY
)"
MOTION_PRESET="$(python - "$WORKDIR/manifest.json" <<'PY'
import json, sys
value = str((json.load(open(sys.argv[1])).get("options") or {}).get("motionPreset") or "none")
print(value if value in ("none", "idle_sway", "turntable") else "none")
PY
)"

report_progress() {
  NAYLA_GPU_PROGRESS_PERCENT="$1" NAYLA_GPU_PROGRESS_STAGE="$2" python - <<'PY'
import json, os, urllib.request
body = json.dumps({
    "jobId": os.environ["NAYLA_GPU_JOB_ID"],
    "progress": {
        "percent": int(os.environ["NAYLA_GPU_PROGRESS_PERCENT"]),
        "stage": os.environ["NAYLA_GPU_PROGRESS_STAGE"],
    },
}).encode("utf-8")
req = urllib.request.Request(
    os.environ["NAYLA_GPU_CALLBACK_URL"],
    data=body,
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer " + os.environ["NAYLA_GPU_CALLBACK_TOKEN"],
    },
    method="POST",
)
try:
    urllib.request.urlopen(req, timeout=15).read()
except Exception as exc:
    print("progress update skipped:", str(exc)[:300])
PY
}

report_progress 8 "GPU lista; leyendo la imagen"

report_progress 18 "Preparando el entorno 3D"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends   git curl build-essential libgl1 libglib2.0-0
rm -rf /var/lib/apt/lists/*

mkdir -p "$WORKDIR/TripoSR"
cd "$WORKDIR/TripoSR"
git init -q
git remote add origin https://github.com/VAST-AI-Research/TripoSR.git
git fetch -q --depth 1 origin 107cefdc244c39106fa830359024f6a2f1c78871
git checkout -q --detach FETCH_HEAD

python -m pip install --no-cache-dir --upgrade "setuptools>=69" wheel
python -m pip install --no-cache-dir -r requirements.txt
report_progress 36 "Cargando el modelo de reconstrucción"

curl --fail --location --silent --show-error   "$INPUT_URL"   --output "$WORKDIR/input"

report_progress 48 "Reconstruyendo el muñeco en 3D"
python run.py "$WORKDIR/input"   --output-dir "$WORKDIR/output"   --model-save-format glb   --mc-resolution 256
report_progress 78 "Modelo base creado; aplicando color y movimiento"

MODEL_PATH="$(find "$WORKDIR/output" -type f -name 'mesh.glb' -print -quit)"
if [ -z "$MODEL_PATH" ] || [ ! -s "$MODEL_PATH" ]; then
  echo "TripoSR did not produce a GLB output" >&2
  exit 20
fi

POSTPROCESS_URL="https://raw.githubusercontent.com/Yanzsmartwood2025/editor-visual-frontend/4ca563e044cc562fc0dc344b8b8fa8fae354f66e/gpu-workers/triposr/postprocess_glb.py"
curl --fail --location --silent --show-error "$POSTPROCESS_URL" --output "$WORKDIR/postprocess_glb.py"
python "$WORKDIR/postprocess_glb.py" "$MODEL_PATH" "$WORKDIR/output/final.glb" --color "$BASE_COLOR" --motion "$MOTION_PRESET"
MODEL_PATH="$WORKDIR/output/final.glb"
report_progress 90 "Subiendo el GLB final a Cloudflare"
curl --fail --silent --show-error   --request PUT   --header "Content-Type: $OUTPUT_TYPE"   --upload-file "$MODEL_PATH"   "$OUTPUT_URL"
report_progress 96 "Cloudflare recibió el modelo; verificando entrega"
