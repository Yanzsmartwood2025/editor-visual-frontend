#!/usr/bin/env python
"""One disposable Wan 2.2 job. No cloud account credentials, no shell prompt execution."""
import datetime
import io
import ipaddress
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

MODEL = 'Wan-AI/Wan2.2-TI2V-5B-Diffusers'
REVISION = 'b8fff7315c768468a5333511427288870b2e9635'
LIMIT = 20 * 1024 * 1024

def remaining(deadline):
    seconds = int(deadline - time.time())
    if seconds <= 0:
        raise TimeoutError('GPU deadline reached')
    return seconds

def validate_options(value):
    defaults = dict(orientation='portrait', duration=3, steps=30, guidance=5, seed=42,
                    negativePrompt='blurry, distorted, low quality, text, watermark', fit='contain')
    if not isinstance(value, dict) or set(value) - set(defaults):
        raise ValueError('Unsupported video options')
    options = {**defaults, **value}
    if options['orientation'] not in ('portrait', 'landscape') or options['fit'] not in ('contain', 'cover'):
        raise ValueError('Invalid frame format')
    if type(options['duration']) is not int or options['duration'] not in (3, 5):
        raise ValueError('Invalid duration')
    if type(options['steps']) is not int or options['steps'] not in (30, 50):
        raise ValueError('Invalid steps')
    if type(options['seed']) is not int or not 0 <= options['seed'] <= 2147483647:
        raise ValueError('Invalid seed')
    if type(options['guidance']) not in (int, float) or not 1 <= options['guidance'] <= 7:
        raise ValueError('Invalid guidance')
    if not isinstance(options['negativePrompt'], str) or len(options['negativePrompt']) > 1000:
        raise ValueError('Invalid negative prompt')
    return options

def validate_public_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('An HTTPS image URL is required')
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('Non-public image address rejected')

class PublicRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def alarm_handler(*_):
    raise TimeoutError('GPU deadline reached')

def main(manifest_url):
    request = urllib.request.Request(manifest_url, headers={
        'Authorization': 'Bearer ' + os.environ['NAYLA_GPU_CALLBACK_TOKEN']})
    with urllib.request.urlopen(request, timeout=30) as response:
        manifest = json.loads(response.read(1024 * 1024))
    if manifest.get('recipe') != 'wan22-image-to-video' or manifest.get('workload') != 'video':
        raise ValueError('Unsupported recipe')
    options = validate_options(manifest.get('options', {}))
    urls = manifest.get('inputUrls', [])
    prompt = manifest.get('prompt', '')
    if len(urls) != 1 or not isinstance(prompt, str) or not 3 <= len(prompt.strip()) <= 1500:
        raise ValueError('One image and a prompt are required')
    deadline = datetime.datetime.fromisoformat(manifest['deadline'].replace('Z', '+00:00')).timestamp() - 30
    signal.signal(signal.SIGALRM, alarm_handler)
    signal.alarm(remaining(deadline))
    output = manifest['output']
    if output['contentType'] != 'video/mp4':
        raise ValueError('MP4 output required')
    # Pinned runtime libraries. The base image supplies CUDA and PyTorch 2.4.
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check',
                    'diffusers==0.35.2', 'transformers==4.51.3', 'accelerate==1.10.1',
                    'huggingface-hub==0.34.4', 'sentencepiece==0.2.0', 'ftfy==6.3.1',
                    'imageio==2.37.0', 'imageio-ffmpeg==0.6.0', 'Pillow==11.3.0', 'numpy==1.26.4'],
                   check=True, timeout=remaining(deadline))
    import torch
    from PIL import Image, ImageOps
    from diffusers import AutoencoderKLWan, WanImageToVideoPipeline
    from diffusers.utils import export_to_video
    Image.MAX_IMAGE_PIXELS = 30_000_000
    validate_public_url(urls[0])
    with urllib.request.build_opener(PublicRedirects).open(urls[0], timeout=min(60, remaining(deadline))) as response:
        image_bytes = response.read(LIMIT + 1)
    if len(image_bytes) > LIMIT:
        raise ValueError('Image exceeds 20 MB')
    image = Image.open(io.BytesIO(image_bytes))
    if image.width * image.height > 30_000_000:
        raise ValueError('Image exceeds 30 megapixels')
    image = ImageOps.exif_transpose(image).convert('RGB')
    width, height = (704, 1280) if options['orientation'] == 'portrait' else (1280, 704)
    image = (ImageOps.fit(image, (width, height)) if options['fit'] == 'cover'
             else ImageOps.pad(image, (width, height), color='black'))
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA unavailable')
    vae = AutoencoderKLWan.from_pretrained(MODEL, revision=REVISION, subfolder='vae', torch_dtype=torch.float32)
    pipeline = WanImageToVideoPipeline.from_pretrained(MODEL, revision=REVISION, vae=vae,
                 torch_dtype=torch.bfloat16, image_encoder=None, image_processor=None, expand_timesteps=True)
    pipeline.enable_model_cpu_offload()
    pipeline.vae.enable_tiling()
    # Report real generation activity to worker logs without URLs, tokens or user text.
    def step_end(_pipe, step, _timestep, callback_kwargs):
        remaining(deadline)
        print(f'Generation step {step + 1}/{options["steps"]}', flush=True)
        return callback_kwargs
    frames = pipeline(image=image, prompt=prompt.strip(), negative_prompt=options['negativePrompt'],
                      width=width, height=height, num_frames=options['duration'] * 24 + 1,
                      num_inference_steps=options['steps'], guidance_scale=options['guidance'],
                      generator=torch.Generator(device='cpu').manual_seed(options['seed']),
                      callback_on_step_end=step_end).frames[0]
    path = Path('/tmp/nayla-video.mp4')
    # The model requires 4n+1 frames; remove the last to export exactly 3 or 5 seconds.
    export_to_video(frames[:options['duration'] * 24], str(path), fps=24, macro_block_size=1)
    if path.stat().st_size <= 0:
        raise RuntimeError('Empty output')
    for attempt in range(3):
        try:
            with path.open('rb') as data:
                upload = urllib.request.Request(output['uploadUrl'], data=data, method='PUT', headers={
                    'Content-Type': 'video/mp4', 'Content-Length': str(path.stat().st_size)})
                with urllib.request.urlopen(upload, timeout=min(120, remaining(deadline))) as response:
                    response.read()
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)
    print('Video uploaded', flush=True)

if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except Exception as exc:
        # Signed URLs and callback credentials must never appear in errors.
        print('Video worker failed: ' + type(exc).__name__, file=sys.stderr)
        sys.exit(1)
