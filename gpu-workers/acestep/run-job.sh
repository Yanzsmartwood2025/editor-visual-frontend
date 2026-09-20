#!/usr/bin/env bash
set -euo pipefail

MANIFEST_URL="${1:?manifest URL required}"
WORKDIR="/tmp/nayla-acestep"
API_PORT="8001"
API_BASE="http://127.0.0.1:${API_PORT}"

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

python - "$WORKDIR/manifest.json" "$WORKDIR/job.json" <<'PY'
import json
import sys
from datetime import datetime, timezone

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
if manifest.get("workload") != "audio":
    raise SystemExit("ACE-Step worker received a non-audio workload")
if manifest.get("recipe") != "ace-step-music":
    raise SystemExit("ACE-Step worker received an unsupported recipe")

prompt = str(manifest.get("prompt") or "").strip()
if not prompt:
    raise SystemExit("ACE-Step music generation requires a prompt")

options = manifest.get("options") or {}
duration = float(options.get("duration") or options.get("durationSeconds") or 30)
duration = max(10.0, min(duration, 90.0))
instrumental = bool(options.get("instrumental", True))
lyrics = str(options.get("lyrics") or "").strip()
if instrumental:
    lyrics = "[inst]"

deadline = str(manifest.get("deadline") or "")
try:
    deadline_ts = datetime.fromisoformat(deadline.replace("Z", "+00:00")).timestamp()
except Exception as exc:
    raise SystemExit(f"Invalid GPU deadline: {exc}")

output = manifest.get("output") or {}
upload_url = output.get("uploadUrl")
if not upload_url:
    raise SystemExit("Missing output upload URL")

payload = {
    "prompt": prompt,
    "lyrics": lyrics,
    "audio_duration": duration,
    "instrumental": instrumental,
    "thinking": False,
    "use_cot_caption": False,
    "use_cot_metas": False,
    "use_cot_language": False,
    "use_format": False,
    "model": "acestep-v15-turbo",
    "batch_size": 1,
    "audio_format": "wav",
}

json.dump(
    {
        "payload": payload,
        "deadlineTs": deadline_ts,
        "uploadUrl": upload_url,
        "contentType": output.get("contentType") or "audio/wav",
    },
    open(sys.argv[2], "w", encoding="utf-8"),
)
PY

cd /app

export ACESTEP_INIT_SERVICE=false
export ACESTEP_CONFIG_PATH=acestep-v15-turbo
export ACESTEP_LM_MODEL_PATH=""
export ACESTEP_LLM_BACKEND=pt
export TOKENIZERS_PARALLELISM=false

uv run python -m acestep.api_server --host 127.0.0.1 --port "$API_PORT"   >"$WORKDIR/acestep-api.log" 2>&1 &
API_PID=$!

cleanup() {
  kill "$API_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

READY=0
for _ in $(seq 1 90); do
  if curl --fail --silent --max-time 3 "$API_BASE/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  if ! kill -0 "$API_PID" >/dev/null 2>&1; then
    tail -n 80 "$WORKDIR/acestep-api.log" >&2 || true
    echo "ACE-Step API exited during startup" >&2
    exit 21
  fi
  sleep 2
done

if [ "$READY" -ne 1 ]; then
  tail -n 80 "$WORKDIR/acestep-api.log" >&2 || true
  echo "ACE-Step API did not become healthy in time" >&2
  exit 22
fi

python - "$WORKDIR/job.json" "$WORKDIR/generated.audio" <<'PY'
import json
import os
import sys
import time
import urllib.parse
import urllib.request

job_path, destination = sys.argv[1], sys.argv[2]
config = json.load(open(job_path, encoding="utf-8"))
api_base = "http://127.0.0.1:8001"

def post_json(path, payload, timeout=60):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        api_base + path,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))

release = post_json("/release_task", config["payload"], timeout=120)
data = release.get("data")

task_id = None
if isinstance(data, dict):
    task_id = data.get("task_id") or data.get("taskId") or data.get("id")
elif isinstance(data, str):
    task_id = data

if not task_id:
    raise SystemExit("ACE-Step did not return a task id")

result_file = None
while time.time() < float(config["deadlineTs"]) - 30:
    query = post_json("/query_result", {"task_id_list": [str(task_id)]}, timeout=30)
    rows = query.get("data") or []
    if isinstance(rows, dict):
        rows = [rows]

    row = next((item for item in rows if isinstance(item, dict)), None)
    if not row:
        time.sleep(4)
        continue

    status = int(row.get("status", 0))
    if status == 2:
        detail = row.get("error") or row.get("message") or row.get("result") or "unknown error"
        raise SystemExit("ACE-Step generation failed: " + str(detail)[:1000])

    if status == 1:
        raw_result = row.get("result")
        if isinstance(raw_result, str):
            try:
                raw_result = json.loads(raw_result)
            except Exception:
                raw_result = None

        candidates = raw_result if isinstance(raw_result, list) else [raw_result]
        for candidate in candidates:
            if isinstance(candidate, dict) and candidate.get("file"):
                result_file = str(candidate["file"])
                break
        if result_file:
            break

    time.sleep(4)

if not result_file:
    raise SystemExit("ACE-Step timed out before producing audio")

if result_file.startswith("http://") or result_file.startswith("https://"):
    download_url = result_file
else:
    download_url = api_base + (result_file if result_file.startswith("/") else "/" + result_file)

request = urllib.request.Request(download_url, method="GET")
with urllib.request.urlopen(request, timeout=120) as response:
    audio = response.read()

if not audio:
    raise SystemExit("ACE-Step returned an empty audio file")

with open(destination, "wb") as handle:
    handle.write(audio)
PY

ffmpeg -hide_banner -loglevel error -y   -i "$WORKDIR/generated.audio"   -ac 2 -ar 44100 -c:a pcm_s16le   "$WORKDIR/output.wav"

if [ ! -s "$WORKDIR/output.wav" ]; then
  echo "ACE-Step did not produce a valid WAV output" >&2
  exit 23
fi

OUTPUT_URL="$(python - "$WORKDIR/job.json" <<'PY'
import json
import sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["uploadUrl"])
PY
)"

OUTPUT_TYPE="$(python - "$WORKDIR/job.json" <<'PY'
import json
import sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["contentType"])
PY
)"

curl --fail --silent --show-error   --request PUT   --header "Content-Type: $OUTPUT_TYPE"   --upload-file "$WORKDIR/output.wav"   "$OUTPUT_URL"
