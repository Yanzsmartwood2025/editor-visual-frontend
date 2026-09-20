# Nayla ephemeral GPU worker contract

Nayla rents Vast.ai instances only for the lifetime of one GPU job. A compatible
worker image must contain an executable:

```
/opt/nayla/run-job
```

The executable receives one argument: the HTTPS manifest URL for the job.

## Environment

Vast injects these values into the container:

- `NAYLA_GPU_JOB_ID`
- `NAYLA_GPU_MANIFEST_URL`
- `NAYLA_GPU_CALLBACK_URL`
- `NAYLA_GPU_CALLBACK_TOKEN`

The callback token is short lived and scoped to one job. Do not persist or log
it.

## Manifest authentication

Fetch the manifest with:

```
Authorization: Bearer $NAYLA_GPU_CALLBACK_TOKEN
```

The manifest contains:

- workload: image, video, audio or 3d
- recipe
- prompt
- public HTTPS input URLs
- deadline
- output.uploadUrl: short-lived R2 presigned PUT
- output.publicUrl
- output.contentType

The worker never receives Cloudflare account keys or bucket credentials.

## Output

Write exactly one final artifact to `output.uploadUrl` with HTTP PUT and the
exact `output.contentType` from the manifest.

Expected default result formats:

- image -> PNG
- video -> MP4
- audio -> WAV
- 3d -> GLB

Exit code 0 means the output is ready. Any non-zero exit marks the job failed.
The container wrapper calls Nayla's callback after the executable exits.

## Lifecycle

1. Nayla checks Vast balance and marketplace offers.
2. Nayla refuses offers above the hourly/job budget caps.
3. Nayla creates one on-demand instance and records a lease deadline.
4. Worker fetches the manifest and runs the requested recipe.
5. Worker PUTs the result directly to R2.
6. Worker callback asks Nayla to verify the R2 object.
7. Nayla registers the result in Bóveda.
8. Nayla destroys the Vast instance.
9. A separate janitor destroys any instance whose lease expires if the callback
   path fails.

A stopped Vast instance is not considered cleaned up. Nayla always uses
destroy/delete for final cleanup because storage can continue billing while a
stopped instance still exists.

## Image requirements

Worker images should:

- run without SSH or Jupyter,
- keep models/cache inside the disposable instance unless a future shared cache
  is explicitly configured,
- avoid embedding API/R2/Firebase/Supabase secrets,
- reject private/link-local input URLs in the worker as defense in depth,
- honor the manifest deadline,
- write progress only to stdout/stderr without printing callback tokens,
- use deterministic recipe names so Nayla can route jobs safely.

The generic `VAST_GPU_WORKER_IMAGE` is a fallback. More specialized images can
be configured with `VAST_IMAGE_WORKER_IMAGE`, `VAST_VIDEO_WORKER_IMAGE`,
`VAST_AUDIO_WORKER_IMAGE`, and `VAST_3D_WORKER_IMAGE`.
