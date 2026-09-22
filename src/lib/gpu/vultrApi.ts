import http from 'node:http';
import https from 'node:https';
import type { GpuProfile } from './profiles';

const VULTR_BASE_URL =
  process.env.VULTR_API_BASE_URL?.trim().replace(/\/$/, '') ||
  'https://api.vultr.com/v2';

export type VultrGpuPlan = {
  id: string;
  vcpu_count?: number;
  ram?: number;
  disk?: number;
  bandwidth?: number;
  monthly_cost?: number;
  type?: string;
  gpu_vram?: number;
  gpu_vram_gb?: number;
  gpu_type?: string;
  locations?: string[];
  link_speed?: number;
  [key: string]: unknown;
};

export type VultrRegion = {
  id: string;
  city?: string;
  country?: string;
  continent?: string;
  options?: string[];
  [key: string]: unknown;
};

export type VultrOperatingSystem = {
  id: number;
  name?: string;
  arch?: string;
  family?: string;
  [key: string]: unknown;
};

export type VultrInstance = {
  id: string;
  label?: string;
  region?: string;
  plan?: string;
  status?: string;
  power_status?: string;
  server_status?: string;
  main_ip?: string;
  date_created?: string;
  [key: string]: unknown;
};

export type VultrSnapshot = {
  id: string;
  description?: string;
  size?: number;
  status?: string;
  date_created?: string;
  os_id?: number;
  app_id?: number;
  [key: string]: unknown;
};


const getVultrApiKey = () => {
  const key = process.env.VULTR_API_KEY?.trim();
  if (!key) throw new Error('VULTR_API_KEY no está configurada en Vercel.');
  return key;
};

export const isVultrConfigured = () =>
  Boolean(process.env.VULTR_API_KEY?.trim());

const vultrRequest = async <T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 20_000
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(VULTR_BASE_URL + path, {
      ...init,
      headers: {
        Authorization: 'Bearer ' + getVultrApiKey(),
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload: any = {};
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { error: raw.slice(0, 1000) };
      }
    }

    if (!response.ok) {
      const detail =
        payload?.error ||
        payload?.message ||
        payload?.error_description ||
        ('HTTP ' + response.status);
      const error = new Error(
        'Nayla Compute no pudo consultar una de sus redes de cómputo: ' +
          String(detail).slice(0, 800)
      );
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    return payload as T;
  } finally {
    clearTimeout(timer);
  }
};

export const getVultrAccountSummary = async () => {
  const data = await vultrRequest<{
    account?: {
      balance?: number;
      pending_charges?: number;
      [key: string]: unknown;
    };
  }>('/account', { method: 'GET' });

  const balance = Number(data.account?.balance);
  const pendingCharges = Number(data.account?.pending_charges);

  if (!Number.isFinite(balance)) {
    throw new Error(
      'Nayla Compute no pudo leer el balance de facturación de una de sus redes.'
    );
  }

  // Vultr exposes a billing balance, not a universal "spendable credit" field.
  // Account type and billing mode can change how the sign should be interpreted,
  // so never use this value by itself to authorize a deployment.
  return {
    balance,
    rawBalance: balance,
    pendingCharges: Number.isFinite(pendingCharges) ? pendingCharges : undefined,
  };
};

export const listVultrRegions = async (): Promise<VultrRegion[]> => {
  const data = await vultrRequest<{ regions?: VultrRegion[] }>(
    '/regions?per_page=500',
    { method: 'GET' }
  );
  return (data.regions || []).filter(
    (region) => typeof region.id === 'string' && region.id.trim()
  );
};

export const listVultrPlans = async (): Promise<VultrGpuPlan[]> => {
  const data = await vultrRequest<{ plans?: VultrGpuPlan[] }>(
    '/plans?per_page=500',
    { method: 'GET' }
  );

  return (data.plans || []).filter(
    (plan) => typeof plan.id === 'string' && plan.id.trim().length > 0
  );
};

export const listVultrOperatingSystems = async (): Promise<VultrOperatingSystem[]> => {
  const data = await vultrRequest<{ os?: VultrOperatingSystem[] }>(
    '/os?per_page=500',
    { method: 'GET' }
  );

  return (data.os || []).filter(
    (os) => Number.isInteger(Number(os.id)) && Number(os.id) > 0
  );
};

export const listVultrGpuPlans = async (): Promise<VultrGpuPlan[]> => {
  const plans = await listVultrPlans();

  return plans.filter((plan) => {
    const type = String(plan.type || '').toLowerCase();
    const gpuType = String(plan.gpu_type || '').trim();
    const gpuVram = Number(plan.gpu_vram_gb ?? plan.gpu_vram);
    return (
      typeof plan.id === 'string' &&
      plan.id.trim().length > 0 &&
      (type === 'vcg' || gpuType.length > 0 || Number.isFinite(gpuVram))
    );
  });
};

const normalizeGpuVramGb = (plan: VultrGpuPlan) => {
  const directGb = Number(plan.gpu_vram_gb);
  if (Number.isFinite(directGb) && directGb > 0) return directGb;

  const raw = Number(plan.gpu_vram);
  if (!Number.isFinite(raw) || raw <= 0) return undefined;

  // Vultr historically exposed this field in GB, but tolerate MB values too.
  return raw > 512 ? Math.round((raw / 1024) * 10) / 10 : raw;
};

export const searchVultrGpuPlans = async (
  profile: GpuProfile
): Promise<Array<{ plan: VultrGpuPlan; region: VultrRegion; hourlyPrice: number }>> => {
  const [plans, regions] = await Promise.all([
    listVultrGpuPlans(),
    listVultrRegions(),
  ]);

  const regionById = new Map(regions.map((region) => [region.id, region]));
  const candidates: Array<{
    plan: VultrGpuPlan;
    region: VultrRegion;
    hourlyPrice: number;
  }> = [];

  for (const plan of plans) {
    const gpuVramGb = normalizeGpuVramGb(plan);
    if (!gpuVramGb || gpuVramGb < profile.minGpuRamGb) continue;

    const monthlyCost = Number(plan.monthly_cost);
    if (!Number.isFinite(monthlyCost) || monthlyCost <= 0) continue;

    const hourlyPrice = monthlyCost / 730;
    const locations = Array.isArray(plan.locations) ? plan.locations : [];

    for (const regionId of locations) {
      const region = regionById.get(regionId);
      if (!region) continue;
      candidates.push({ plan, region, hourlyPrice });
    }
  }

  return candidates.sort(
    (a, b) =>
      a.hourlyPrice - b.hourlyPrice ||
      Number(normalizeGpuVramGb(b.plan) || 0) -
        Number(normalizeGpuVramGb(a.plan) || 0)
  );
};

const shellQuote = (value: string) =>
  "'" + value.replace(/'/g, "'\\''") + "'";

const encodeUserData = (value: string) =>
  Buffer.from(value, 'utf8').toString('base64');

export const combineVultrUserData = (...encodedScripts: string[]) => {
  const scripts = encodedScripts
    .filter(Boolean)
    .map((value, index) => {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      return index === 0 ? decoded : decoded.replace(/^#![^\n]*\n/, '');
    });
  return encodeUserData(scripts.join('\n'));
};

export const probeNaylaPcDesktop = async (
  ip?: string | null,
  port = 6080,
  path = '/vnc.html'
): Promise<boolean> => {
  if (!ip || ip === '0.0.0.0') return false;

  return await new Promise<boolean>((resolve) => {
    const request = https.get(
      {
        hostname: ip,
        port,
        path,
        method: 'GET',
        rejectUnauthorized: false,
        timeout: 4_500,
        headers: { Host: ip },
      },
      (response) => {
        response.resume();
        resolve(
          Number(response.statusCode) >= 200 &&
            Number(response.statusCode) < 500
        );
      }
    );

    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
};

export const probeNaylaPcBuildStatus = async (
  ip?: string | null,
  port = 6082
): Promise<{ reachable: boolean; stage?: string; detail?: string }> => {
  if (!ip || ip === '0.0.0.0') return { reachable: false };

  return await new Promise((resolve) => {
    const request = http.get(
      {
        hostname: ip,
        port,
        path: '/status.json',
        method: 'GET',
        timeout: 4_500,
        headers: { Host: ip },
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          if (raw.length < 4096) raw += chunk;
        });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve({
              reachable: true,
              stage: typeof parsed?.stage === 'string' ? parsed.stage : undefined,
              detail: typeof parsed?.detail === 'string' ? parsed.detail : undefined,
            });
          } catch {
            resolve({ reachable: true, detail: raw.slice(0, 500) || undefined });
          }
        });
      }
    );

    request.on('timeout', () => {
      request.destroy();
      resolve({ reachable: false });
    });
    request.on('error', () => resolve({ reachable: false }));
  });
};

export const buildNaylaPcDesktopUserData = ({
  desktopPassword,
}: {
  desktopPassword: string;
}) => {
  const password = desktopPassword.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
  if (password.length < 8) {
    throw new Error('La clave temporal del escritorio Nayla PC no es válida.');
  }

  const script = [
    '#!/usr/bin/env bash',
    'set -Eeuo pipefail',
    'export DEBIAN_FRONTEND=noninteractive',
    'mkdir -p /var/lib/nayla-base-status',
    "printf '%s\\n' '{\"stage\":\"boot\",\"detail\":\"cloud-init started\"}' > /var/lib/nayla-base-status/status.json",
    "cat > /etc/systemd/system/nayla-base-status.service <<'EOF'",
    '[Unit]',
    'Description=Nayla base build status',
    'After=network.target',
    '[Service]',
    'Type=simple',
    'ExecStart=/usr/bin/python3 -m http.server 6082 --bind 0.0.0.0 --directory /var/lib/nayla-base-status',
    'Restart=always',
    'RestartSec=2',
    '[Install]',
    'WantedBy=multi-user.target',
    'EOF',
    'systemctl daemon-reload',
    'systemctl enable --now nayla-base-status.service',
    "trap 'code=$?; line=$LINENO; printf \"{\\\"stage\\\":\\\"error\\\",\\\"detail\\\":\\\"line %s exit %s\\\"}\\n\" \"$line\" \"$code\" > /var/lib/nayla-base-status/status.json; exit $code' ERR",
    "printf '%s\\n' '{\"stage\":\"packages\",\"detail\":\"installing desktop packages\"}' > /var/lib/nayla-base-status/status.json",
    'apt-get update',
    'apt-get install -y --no-install-recommends xfce4 xfce4-terminal dbus-x11 xvfb x11vnc novnc websockify openssl ufw curl ca-certificates',
    "printf '%s\\n' '{\"stage\":\"services\",\"detail\":\"configuring desktop services\"}' > /var/lib/nayla-base-status/status.json",
    'id -u nayla >/dev/null 2>&1 || useradd -m -s /bin/bash nayla',
    'usermod -aG sudo nayla',
    "printf '%s\\n' 'nayla ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/nayla",
    'chmod 440 /etc/sudoers.d/nayla',
    'install -d -m 700 -o nayla -g nayla /home/nayla/.vnc',
    '/usr/bin/x11vnc -storepasswd ' + shellQuote(password) + ' /home/nayla/.vnc/passwd >/dev/null',
    'chown nayla:nayla /home/nayla/.vnc/passwd',
    'chmod 600 /home/nayla/.vnc/passwd',
    'install -d -m 700 /etc/nayla',
    'install -d -m 755 -o nayla -g nayla "/home/nayla/Nayla Drive"',
    'for d in Desktop Documents Downloads Pictures Videos Music; do',
    '  install -d -m 755 -o nayla -g nayla "/home/nayla/Nayla Drive/$d"',
    '  if [ -d "/home/nayla/$d" ] && [ ! -L "/home/nayla/$d" ]; then cp -a "/home/nayla/$d/." "/home/nayla/Nayla Drive/$d/" 2>/dev/null || true; rm -rf "/home/nayla/$d"; fi',
    '  ln -sfn "/home/nayla/Nayla Drive/$d" "/home/nayla/$d"',
    'done',
    'chown -R nayla:nayla "/home/nayla/Nayla Drive"',
    "openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj '/CN=Nayla-PC' -keyout /etc/nayla/novnc.key -out /etc/nayla/novnc.crt",
    "cat > /etc/systemd/system/nayla-xvfb.service <<'EOF'",
    '[Unit]',
    'Description=Nayla PC virtual display',
    'After=network.target',
    '[Service]',
    'Type=simple',
    'User=nayla',
    'Environment=HOME=/home/nayla',
    'ExecStart=/usr/bin/Xvfb :1 -screen 0 1440x900x24 -nolisten tcp -ac',
    'Restart=always',
    'RestartSec=2',
    '[Install]',
    'WantedBy=multi-user.target',
    'EOF',
    "cat > /etc/systemd/system/nayla-xfce.service <<'EOF'",
    '[Unit]',
    'Description=Nayla PC XFCE session',
    'After=nayla-xvfb.service',
    'Requires=nayla-xvfb.service',
    '[Service]',
    'Type=simple',
    'User=nayla',
    'Environment=HOME=/home/nayla',
    'Environment=DISPLAY=:1',
    'ExecStartPre=/bin/sleep 2',
    'ExecStart=/usr/bin/dbus-run-session -- /usr/bin/xfce4-session',
    'Restart=on-failure',
    'RestartSec=3',
    '[Install]',
    'WantedBy=multi-user.target',
    'EOF',
    "cat > /etc/systemd/system/nayla-vnc.service <<'EOF'",
    '[Unit]',
    'Description=Nayla PC VNC bridge',
    'After=nayla-xvfb.service',
    'Requires=nayla-xvfb.service',
    '[Service]',
    'Type=simple',
    'User=nayla',
    'Environment=HOME=/home/nayla',
    'ExecStartPre=/bin/sleep 2',
    'ExecStart=/usr/bin/x11vnc -display :1 -forever -shared -localhost -rfbport 5901 -rfbauth /home/nayla/.vnc/passwd -noxdamage -repeat',
    'Restart=always',
    'RestartSec=2',
    '[Install]',
    'WantedBy=multi-user.target',
    'EOF',
    "cat > /etc/systemd/system/nayla-novnc.service <<'EOF'",
    '[Unit]',
    'Description=Nayla PC browser desktop',
    'After=network.target nayla-vnc.service',
    'Requires=nayla-vnc.service',
    '[Service]',
    'Type=simple',
    'ExecStart=/usr/bin/websockify --web=/usr/share/novnc --cert=/etc/nayla/novnc.crt --key=/etc/nayla/novnc.key 0.0.0.0:6080 127.0.0.1:5901',
    'Restart=always',
    'RestartSec=2',
    '[Install]',
    'WantedBy=multi-user.target',
    'EOF',
    'systemctl daemon-reload',
    'systemctl enable nayla-xvfb.service nayla-xfce.service nayla-vnc.service nayla-novnc.service',
    'systemctl start nayla-xvfb.service',
    'sleep 3',
    'systemctl start nayla-vnc.service',
    'systemctl start nayla-novnc.service',
    'systemctl start nayla-xfce.service',
    "printf '%s\\n' '{\"stage\":\"verifying\",\"detail\":\"checking local desktop services\"}' > /var/lib/nayla-base-status/status.json",
    'for i in $(seq 1 30); do',
    '  if systemctl is-active --quiet nayla-xvfb.service && systemctl is-active --quiet nayla-vnc.service && systemctl is-active --quiet nayla-novnc.service && systemctl is-active --quiet nayla-xfce.service && curl -kfsS --max-time 3 https://127.0.0.1:6080/vnc.html >/dev/null; then break; fi',
    '  if [ "$i" -eq 30 ]; then',
    '    printf \'{"stage":"error","detail":"desktop services did not become ready"}\\n\' > /var/lib/nayla-base-status/status.json',
    '    systemctl --no-pager --full status nayla-xvfb.service nayla-xfce.service nayla-vnc.service nayla-novnc.service > /var/lib/nayla-base-status/services.txt 2>&1 || true',
    '    exit 42',
    '  fi',
    '  sleep 2',
    'done',
    'ufw --force reset',
    'ufw default deny incoming',
    'ufw default allow outgoing',
    'ufw allow 22/tcp',
    'ufw allow 6080/tcp',
    'ufw allow 6082/tcp',
    'ufw --force enable',
    "printf '%s\\n' 'ready' > /usr/share/novnc/nayla-base-ready.txt",
    "printf '%s\\n' '{\"stage\":\"ready\",\"detail\":\"desktop verified locally\"}' > /var/lib/nayla-base-status/status.json",
    "cat > /usr/local/sbin/nayla-seal-base-image <<'EOF'",
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'cloud-init clean --logs --machine-id',
    'systemctl disable --now nayla-base-status.service || true',
    'rm -f /etc/systemd/system/nayla-base-status.service',
    'ufw delete allow 6082/tcp || true',
    'systemctl daemon-reload',
    'EOF',
    'chmod 755 /usr/local/sbin/nayla-seal-base-image',
    'systemd-run --unit=nayla-base-seal --on-active=60s /usr/local/sbin/nayla-seal-base-image >/dev/null',
  ].join('\n');

  return encodeUserData(script);
};

export const buildNaylaPcRuntimeUserData = ({
  desktopPassword,
  driveToken,
  instanceId,
  driveApiBaseUrl,
}: {
  desktopPassword: string;
  driveToken: string;
  instanceId: string;
  driveApiBaseUrl: string;
}) => {
  const password = desktopPassword.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
  if (password.length < 8) {
    throw new Error('La clave temporal del escritorio Nayla PC no es válida.');
  }

  const agent = [
    '#!/usr/bin/env python3',
    'import datetime, hashlib, json, mimetypes, os, pathlib, shutil, subprocess, tempfile, time, urllib.request',
    "ROOT = pathlib.Path('/home/nayla/Nayla Drive')",
    "STATE = pathlib.Path('/home/nayla/.nayla-drive-state.json')",
    "API = os.environ.get('NAYLA_DRIVE_API', '')",
    "TOKEN = os.environ.get('NAYLA_DRIVE_TOKEN', '')",
    "INSTANCE = os.environ.get('NAYLA_PC_INSTANCE_ID', '')",
    'def req(method, payload=None):',
    '    body=json.dumps(payload).encode() if payload is not None else None',
    "    h={'Authorization':'Bearer '+TOKEN,'X-Nayla-PC-Instance':INSTANCE}",
    "    if payload is not None: h['Content-Type']='application/json'",
    '    r=urllib.request.urlopen(urllib.request.Request(API,data=body,headers=h,method=method),timeout=60)',
    '    raw=r.read()',
    "    return json.loads(raw.decode()) if raw else {}",
    'def sha(path):',
    '    h=hashlib.sha256()',
    "    with open(path,'rb') as f:",
    "        for chunk in iter(lambda:f.read(1024*1024), b''): h.update(chunk)",
    '    return h.hexdigest()',
    'def stamp(value):',
    '    if not value: return 0.0',
    '    try: return datetime.datetime.fromisoformat(str(value).replace("Z","+00:00")).timestamp()',
    '    except Exception: return 0.0',
    'def load_state():',
    '    try: return json.loads(STATE.read_text())',
    '    except Exception: return {}',
    'def save_state(value):',
    '    tmp=STATE.with_suffix(".tmp")',
    '    tmp.write_text(json.dumps(value,sort_keys=True))',
    '    tmp.replace(STATE)',
    'def download(item,dst):',
    "    url=item.get('downloadUrl','')",
    '    if not url: return False',
    '    dst.parent.mkdir(parents=True,exist_ok=True)',
    '    fd,tmpname=tempfile.mkstemp(prefix=".nayla-",dir=str(dst.parent)); os.close(fd)',
    '    tmp=pathlib.Path(tmpname)',
    '    try:',
    '        with urllib.request.urlopen(url,timeout=120) as src, open(tmp,"wb") as out: shutil.copyfileobj(src,out,1024*1024)',
    '        tmp.replace(dst)',
    "        remote_time=stamp(item.get('modifiedAt') or item.get('uploadedAt'))",
    '        if remote_time>0: os.utime(dst,(remote_time,remote_time))',
    '        return True',
    '    except Exception:',
    '        try: tmp.unlink(missing_ok=True)',
    '        except Exception: pass',
    '        return False',
    'def upload(path,rel,digest,ctype):',
    "    prep=req('POST',{'action':'presign_upload','relativePath':rel,'sizeBytes':path.stat().st_size,'contentType':ctype,'contentSha256':digest,'modifiedAt':datetime.datetime.fromtimestamp(path.stat().st_mtime,datetime.timezone.utc).isoformat().replace('+00:00','Z')})",
    "    url=prep.get('uploadUrl','')",
    '    if not url: return False',
    '    fd,headerfile=tempfile.mkstemp(prefix=".nayla-head-"); os.close(fd)',
    '    try:',
    '        subprocess.run(["curl","--fail","--silent","--show-error","-X","PUT","-H","Content-Type: "+ctype,"--upload-file",str(path),"-D",headerfile,url],check=True,timeout=3600)',
    '        etag=""',
    '        try:',
    '            for line in pathlib.Path(headerfile).read_text(errors="ignore").splitlines():',
    '                if line.lower().startswith("etag:"): etag=line.split(":",1)[1].strip().strip(chr(34))',
    '        except Exception: pass',
    "        req('POST',{'action':'confirm_upload','relativePath':rel,'r2Key':prep.get('r2Key'),'sizeBytes':path.stat().st_size,'contentType':ctype,'contentSha256':digest,'etag':etag})",
    '        return True',
    '    finally:',
    '        try: pathlib.Path(headerfile).unlink(missing_ok=True)',
    '        except Exception: pass',
    'def sync_once():',
    '    ROOT.mkdir(parents=True,exist_ok=True)',
    "    control=req('GET')",
    "    if control.get('freezeForSnapshot'): return",
    '    previous=load_state()',
    "    manifest=control.get('files',[])",
    "    remote={x.get('relativePath'):x for x in manifest if x.get('relativePath')}",
    '    confirmed={}',
    '    # Pull only missing or genuinely newer remote files. A local newer edit always wins.',
    '    for rel,item in remote.items():',
    '        dst=ROOT/rel',
    "        rh=item.get('contentSha256') or ''",
    '        if not dst.exists():',
    '            if rel in previous and previous.get(rel)==rh:',
    "                try: req('POST',{'action':'delete_file','relativePath':rel}); continue",
    '                except Exception: pass',
    '            if download(item,dst): confirmed[rel]=rh or sha(dst)',
    '            continue',
    '        try: lh=sha(dst)',
    '        except Exception: continue',
    '        if rh and lh==rh:',
    '            confirmed[rel]=rh; continue',
    "        remote_time=stamp(item.get('modifiedAt') or item.get('uploadedAt'))",
    '        if remote_time > dst.stat().st_mtime + 2:',
    '            if download(item,dst): confirmed[rel]=rh or sha(dst)',
    '    # Push local/newer files with curl streaming so file size is not held in RAM.',
    '    for p in ROOT.rglob("*"):',
    '        if not p.is_file(): continue',
    '        rel=p.relative_to(ROOT).as_posix()',
    '        try: digest=sha(p)',
    '        except Exception: continue',
    "        rh=remote.get(rel,{}).get('contentSha256') or ''",
    '        if digest==rh:',
    '            confirmed[rel]=digest; continue',
    "        remote_time=stamp(remote.get(rel,{}).get('modifiedAt') or remote.get(rel,{}).get('uploadedAt'))",
    '        if remote_time > p.stat().st_mtime + 2:',
    '            continue',
    "        ctype=mimetypes.guess_type(str(p))[0] or 'application/octet-stream'",
    '        try:',
    '            if upload(p,rel,digest,ctype): confirmed[rel]=digest',
    '        except Exception as exc: print("nayla-drive upload:",rel,exc)',
    '    save_state(confirmed)',
    "    if control.get('prepareSnapshot'):",
    "        final_manifest=req('GET').get('files',[])",
    "        final_remote={x.get('relativePath'):x for x in final_manifest if x.get('relativePath')}",
    '        safe=True',
    '        for p in ROOT.rglob("*"):',
    '            if not p.is_file(): continue',
    '            rel=p.relative_to(ROOT).as_posix()',
    '            try: digest=sha(p)',
    '            except Exception: safe=False; break',
    "            if (final_remote.get(rel,{}).get('contentSha256') or '') != digest:",
    '                safe=False; break',
    '        if safe:',
    '            for child in list(ROOT.iterdir()):',
    '                try:',
    '                    shutil.rmtree(child) if child.is_dir() else child.unlink()',
    '                except Exception as exc:',
    '                    print("nayla-drive purge:",child,exc); safe=False',
    '            if safe:',
    '                for name in ["Desktop","Documents","Downloads","Pictures","Videos","Music"]:',
    '                    (ROOT/name).mkdir(parents=True,exist_ok=True)',
    '                save_state({})',
    '                subprocess.run(["sudo","cloud-init","clean","--logs","--machine-id"],check=True,timeout=60)',
    "                req('POST',{'action':'snapshot_cache_flushed'})",
    'if __name__ == "__main__":',
    '    try: sync_once()',
    '    except Exception as exc: print("nayla-drive:",exc)',
  ].join('\n');

  const agentPayload = Buffer.from(agent, 'utf8').toString('base64');
  const script = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'install -d -m 700 -o nayla -g nayla /home/nayla/.vnc',
    '/usr/bin/x11vnc -storepasswd ' + shellQuote(password) + ' /home/nayla/.vnc/passwd >/dev/null',
    'chown nayla:nayla /home/nayla/.vnc/passwd',
    'chmod 600 /home/nayla/.vnc/passwd',
    'install -d -m 700 /etc/nayla',
    "printf '%s\\n' " +
      shellQuote('NAYLA_DRIVE_API=' + driveApiBaseUrl) +
      ' ' +
      shellQuote('NAYLA_DRIVE_TOKEN=' + driveToken) +
      ' ' +
      shellQuote('NAYLA_PC_INSTANCE_ID=' + instanceId) +
      ' > /etc/nayla/drive.env',
    'chown root:nayla /etc/nayla/drive.env',
    'chmod 640 /etc/nayla/drive.env',
    "echo " + shellQuote(agentPayload) + " | base64 -d > /usr/local/bin/nayla-drive-sync",
    'chmod 755 /usr/local/bin/nayla-drive-sync',
    'install -d -m 755 -o nayla -g nayla "/home/nayla/Nayla Drive"',
    "cat > /etc/systemd/system/nayla-drive-sync.service <<'EOF'",
    '[Unit]',
    'Description=Nayla Drive R2 sync',
    'After=network-online.target',
    'Wants=network-online.target',
    '[Service]',
    'Type=oneshot',
    'User=nayla',
    'Group=nayla',
    'EnvironmentFile=/etc/nayla/drive.env',
    'ExecStart=/usr/local/bin/nayla-drive-sync',
    'EOF',
    "cat > /etc/systemd/system/nayla-drive-sync.timer <<'EOF'",
    '[Unit]',
    'Description=Sync Nayla Drive to R2 every 30 seconds',
    '[Timer]',
    'OnBootSec=10s',
    'OnUnitActiveSec=30s',
    'AccuracySec=5s',
    'Persistent=true',
    '[Install]',
    'WantedBy=timers.target',
    'EOF',
    'systemctl daemon-reload',
    'systemctl restart nayla-vnc.service || true',
    'systemctl restart nayla-novnc.service || true',
    'systemctl enable --now nayla-drive-sync.timer',
  ].join('\n');

  return encodeUserData(script);
};

export const buildVultrWorkerUserData = ({
  imageName,
  onstart,
  env,
}: {
  imageName: string;
  onstart: string;
  env: Record<string, string>;
}) => {
  const scriptPayload = Buffer.from(onstart, 'utf8').toString('base64');
  const envArgs = Object.entries(env)
    .map(([key, value]) => '--env ' + shellQuote(key + '=' + value))
    .join(' \\\n  ');

  const userData = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'until command -v docker >/dev/null 2>&1; do sleep 2; done',
    'until docker info >/dev/null 2>&1; do sleep 2; done',
    'docker pull ' + shellQuote(imageName),
    'docker run --rm --gpus all \\',
    '  ' + envArgs + ' \\',
    '  ' + shellQuote(imageName) + ' bash -lc ' +
      shellQuote('echo ' + shellQuote(scriptPayload) + ' | base64 -d | bash'),
  ].join('\n');

  return encodeUserData(userData);
};

export const createVultrGpuInstance = async ({
  planId,
  regionId,
  label,
  userData,
}: {
  planId: string;
  regionId: string;
  label: string;
  userData: string;
}) => {
  const osId = Number(process.env.VULTR_GPU_OS_ID || '1743');
  if (!Number.isInteger(osId) || osId <= 0) {
    throw new Error('VULTR_GPU_OS_ID no es válido.');
  }

  const data = await vultrRequest<{ instance?: VultrInstance }>(
    '/instances',
    {
      method: 'POST',
      body: JSON.stringify({
        region: regionId,
        plan: planId,
        os_id: osId,
        label: label.slice(0, 128),
        hostname: label.slice(0, 63),
        user_data: userData,
        activation_email: false,
      }),
    },
    40_000
  );

  if (!data.instance?.id) {
    throw new Error('Nayla Compute no recibió un identificador válido para la GPU.');
  }

  return data.instance;
};

export const createVultrInstance = async ({
  planId,
  regionId,
  osId,
  label,
  userData,
}: {
  planId: string;
  regionId: string;
  osId: number;
  label: string;
  userData?: string;
}) => {
  if (!Number.isInteger(osId) || osId <= 0) {
    throw new Error('El sistema operativo de Nayla PC no es válido.');
  }

  const body: Record<string, unknown> = {
    region: regionId,
    plan: planId,
    os_id: osId,
    label: label.slice(0, 128),
    hostname: label.slice(0, 63),
    activation_email: false,
  };

  if (userData) body.user_data = userData;

  const data = await vultrRequest<{ instance?: VultrInstance }>(
    '/instances',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    40_000
  );

  if (!data.instance?.id) {
    throw new Error('Nayla PC no recibió un identificador válido de la instancia.');
  }

  return data.instance;
};

export const createVultrInstanceFromSnapshot = async ({
  planId,
  regionId,
  snapshotId,
  label,
  userData,
}: {
  planId: string;
  regionId: string;
  snapshotId: string;
  label: string;
  userData?: string;
}) => {
  const data = await vultrRequest<{ instance?: VultrInstance }>(
    '/instances',
    {
      method: 'POST',
      body: JSON.stringify({
        region: regionId,
        plan: planId,
        snapshot_id: snapshotId,
        label: label.slice(0, 128),
        hostname: label.slice(0, 63),
        activation_email: false,
        ...(userData ? { user_data: userData } : {}),
      }),
    },
    40_000
  );

  if (!data.instance?.id) {
    throw new Error('Nayla PC no recibió un identificador válido al restaurar el snapshot.');
  }

  return data.instance;
};

export const createVultrSnapshot = async ({
  instanceId,
  description,
}: {
  instanceId: string;
  description: string;
}): Promise<VultrSnapshot> => {
  const data = await vultrRequest<{ snapshot?: VultrSnapshot }>(
    '/snapshots',
    {
      method: 'POST',
      body: JSON.stringify({
        instance_id: instanceId,
        description: description.slice(0, 255),
      }),
    },
    40_000
  );

  if (!data.snapshot?.id) {
    throw new Error('Vultr no devolvió un identificador válido para el snapshot.');
  }

  return data.snapshot;
};

export const getVultrSnapshot = async (
  snapshotId: string
): Promise<VultrSnapshot | null> => {
  try {
    const data = await vultrRequest<{ snapshot?: VultrSnapshot }>(
      '/snapshots/' + encodeURIComponent(snapshotId),
      { method: 'GET' }
    );
    return data.snapshot || null;
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) return null;
    throw error;
  }
};

export const deleteVultrSnapshot = async (
  snapshotId: string
): Promise<void> => {
  try {
    await vultrRequest<unknown>(
      '/snapshots/' + encodeURIComponent(snapshotId),
      { method: 'DELETE' },
      20_000
    );
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) return;
    throw error;
  }
};

export const listVultrInstances = async (): Promise<VultrInstance[]> => {
  const data = await vultrRequest<{ instances?: VultrInstance[] }>(
    '/instances?per_page=500',
    { method: 'GET' }
  );
  return (data.instances || []).filter(
    (instance) => typeof instance.id === 'string' && instance.id.trim()
  );
};

export const findVultrInstanceByLabel = async (
  label: string
): Promise<VultrInstance | null> => {
  const instances = await listVultrInstances();
  return (
    instances.find(
      (instance) => String(instance.label || '').trim() === label.trim()
    ) || null
  );
};

export const getVultrInstance = async (
  instanceId: string
): Promise<VultrInstance | null> => {
  try {
    const data = await vultrRequest<{ instance?: VultrInstance }>(
      '/instances/' + encodeURIComponent(instanceId),
      { method: 'GET' }
    );
    return data.instance || null;
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) return null;
    throw error;
  }
};

const postVultrInstanceAction = async (
  instanceId: string,
  action: 'start' | 'halt' | 'reboot'
): Promise<void> => {
  await vultrRequest<unknown>(
    '/instances/' + encodeURIComponent(instanceId) + '/' + action,
    { method: 'POST' },
    20_000
  );
};

export const startVultrInstance = async (instanceId: string) =>
  postVultrInstanceAction(instanceId, 'start');

export const haltVultrInstance = async (instanceId: string) =>
  postVultrInstanceAction(instanceId, 'halt');

export const rebootVultrInstance = async (instanceId: string) =>
  postVultrInstanceAction(instanceId, 'reboot');

export const deleteVultrInstance = async (
  instanceId: string
): Promise<void> => {
  try {
    await vultrRequest<unknown>(
      '/instances/' + encodeURIComponent(instanceId),
      { method: 'DELETE' },
      20_000
    );
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) return;
    throw error;
  }
};

export const parseVultrCandidateId = (value: string) => {
  const splitAt = value.indexOf('@');
  if (splitAt <= 0 || splitAt >= value.length - 1) return null;
  return {
    planId: value.slice(0, splitAt),
    regionId: value.slice(splitAt + 1),
  };
};

export const getVultrGpuVramGb = normalizeGpuVramGb;
