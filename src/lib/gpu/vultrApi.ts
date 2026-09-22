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
      'Nayla Compute no pudo leer el saldo disponible de una de sus redes GPU.'
    );
  }

  const spendable = Math.max(
    0,
    balance - (Number.isFinite(pendingCharges) ? Math.max(0, pendingCharges) : 0)
  );

  return {
    balance: spendable,
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
  port = 6080
): Promise<boolean> => {
  if (!ip || ip === '0.0.0.0') return false;

  return await new Promise<boolean>((resolve) => {
    const request = https.get(
      {
        hostname: ip,
        port,
        path: '/vnc.html',
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
    'set -euo pipefail',
    'export DEBIAN_FRONTEND=noninteractive',
    'apt-get update',
    'apt-get install -y xfce4 xfce4-terminal dbus-x11 tigervnc-standalone-server tigervnc-tools novnc websockify openssl ufw',
    'id -u nayla >/dev/null 2>&1 || useradd -m -s /bin/bash nayla',
    'usermod -aG sudo nayla',
    "printf '%s\\n' 'nayla ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/nayla",
    'chmod 440 /etc/sudoers.d/nayla',
    'install -d -m 700 -o nayla -g nayla /home/nayla/.vnc',
    "printf '%s\\n' " + shellQuote(password) + " | tigervncpasswd -f > /home/nayla/.vnc/passwd",
    'chown nayla:nayla /home/nayla/.vnc/passwd',
    'chmod 600 /home/nayla/.vnc/passwd',
    "cat > /home/nayla/.vnc/xstartup <<'EOF'",
    '#!/bin/sh',
    'unset SESSION_MANAGER',
    'unset DBUS_SESSION_BUS_ADDRESS',
    'startxfce4',
    'EOF',
    'chown nayla:nayla /home/nayla/.vnc/xstartup',
    'chmod 755 /home/nayla/.vnc/xstartup',
    'install -d -m 700 /etc/nayla',
    'install -d -m 755 -o nayla -g nayla "/home/nayla/Nayla Drive"',
    'for d in Desktop Documents Downloads Pictures Videos Music; do',
    '  install -d -m 755 -o nayla -g nayla "/home/nayla/Nayla Drive/$d"',
    '  if [ -d "/home/nayla/$d" ] && [ ! -L "/home/nayla/$d" ]; then cp -a "/home/nayla/$d/." "/home/nayla/Nayla Drive/$d/" 2>/dev/null || true; rm -rf "/home/nayla/$d"; fi',
    '  ln -sfn "/home/nayla/Nayla Drive/$d" "/home/nayla/$d"',
    'done',
    'chown -R nayla:nayla "/home/nayla/Nayla Drive"',
    "openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj '/CN=Nayla-PC' -keyout /etc/nayla/novnc.key -out /etc/nayla/novnc.crt",
    "cat > /etc/systemd/system/nayla-vnc.service <<'EOF'",
    '[Unit]',
    'Description=Nayla PC VNC desktop',
    'After=network.target',
    '[Service]',
    'Type=forking',
    'User=nayla',
    'PAMName=login',
    'PIDFile=/home/nayla/.vnc/%H:1.pid',
    'ExecStartPre=-/usr/bin/tigervncserver -kill :1',
    'ExecStart=/usr/bin/tigervncserver :1 -localhost yes -geometry 1440x900 -depth 24 -SecurityTypes VncAuth -PasswordFile /home/nayla/.vnc/passwd',
    'ExecStop=/usr/bin/tigervncserver -kill :1',
    'Restart=on-failure',
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
    'RestartSec=3',
    '[Install]',
    'WantedBy=multi-user.target',
    'EOF',
    'systemctl daemon-reload',
    'systemctl enable --now nayla-vnc.service nayla-novnc.service',
    'ufw --force reset',
    'ufw default deny incoming',
    'ufw default allow outgoing',
    'ufw allow 22/tcp',
    'ufw allow 6080/tcp',
    'ufw --force enable',
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
    'import hashlib, json, mimetypes, os, pathlib, time, urllib.request',
    "ROOT = pathlib.Path('/home/nayla/Nayla Drive')",
    "API = os.environ.get('NAYLA_DRIVE_API', '')",
    "TOKEN = os.environ.get('NAYLA_DRIVE_TOKEN', '')",
    "INSTANCE = os.environ.get('NAYLA_PC_INSTANCE_ID', '')",
    'def req(method, payload=None, url=None, data=None, headers=None):',
    '    target = url or API',
    '    body = data if data is not None else (json.dumps(payload).encode() if payload is not None else None)',
    "    h = {'Authorization': 'Bearer ' + TOKEN, 'X-Nayla-PC-Instance': INSTANCE}",
    '    if payload is not None: h[\'Content-Type\'] = \'application/json\'',
    '    if headers: h.update(headers)',
    '    r = urllib.request.urlopen(urllib.request.Request(target, data=body, headers=h, method=method), timeout=60)',
    '    raw = r.read()',
    "    return (json.loads(raw.decode()) if raw else {}), dict(r.headers)",
    'def sha(path):',
    '    h=hashlib.sha256()',
    "    with open(path,'rb') as f:",
    "        for chunk in iter(lambda:f.read(1024*1024), b''): h.update(chunk)",
    '    return h.hexdigest()',

    'def sync_once():',
    '    ROOT.mkdir(parents=True, exist_ok=True)',
    "    state,_=req('GET')",
    "    manifest=state.get('files',[])",
    "    remote={x.get('relativePath'):x for x in manifest}",
    '    for item in manifest:',
    "        rel=item.get('relativePath',''); url=item.get('downloadUrl','')",
    '        if not rel or not url: continue',
    '        dst=ROOT/rel; dst.parent.mkdir(parents=True,exist_ok=True)',
    "        remote_hash=item.get('contentSha256')",
    '        if dst.exists() and remote_hash:',
    '            try:',
    '                if sha(dst)==remote_hash: continue',
    '            except Exception: pass',
    '        try: dst.write_bytes(urllib.request.urlopen(url,timeout=60).read())',
    '        except Exception: pass',
    '    for p in ROOT.rglob(\'*\'):',
    '        if not p.is_file(): continue',
    '        rel=p.relative_to(ROOT).as_posix()',
    '        digest=sha(p)',
    '        if remote.get(rel,{}).get(\'contentSha256\')==digest: continue',
    "        ctype=mimetypes.guess_type(str(p))[0] or 'application/octet-stream'",
    "        prep,_=req('POST', {'action':'presign_upload','relativePath':rel,'sizeBytes':p.stat().st_size,'contentType':ctype,'contentSha256':digest,'modifiedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(p.stat().st_mtime))})",
    "        upload=prep.get('uploadUrl')",
    '        if not upload: continue',
    "        data=p.read_bytes()",
    "        put=urllib.request.urlopen(urllib.request.Request(upload,data=data,headers={'Content-Type':ctype},method='PUT'),timeout=120)",
    "        req('POST', {'action':'confirm_upload','relativePath':rel,'r2Key':prep.get('r2Key'),'sizeBytes':len(data),'contentType':ctype,'contentSha256':digest,'etag':put.headers.get('ETag')})",
    'if __name__ == \'__main__\':',
    '    try: sync_once()',
    '    except Exception as exc: print(\'nayla-drive:\', exc)',
  ].join('\n');

  const agentPayload = Buffer.from(agent, 'utf8').toString('base64');
  const script = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'install -d -m 700 -o nayla -g nayla /home/nayla/.vnc',
    "printf '%s\\n' " + shellQuote(password) + " | tigervncpasswd -f > /home/nayla/.vnc/passwd",
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
    'chmod 600 /etc/nayla/drive.env',
    "echo " + shellQuote(agentPayload) + " | base64 -d > /usr/local/bin/nayla-drive-sync",
    'chmod 755 /usr/local/bin/nayla-drive-sync',
    "cat > /etc/systemd/system/nayla-drive-sync.service <<'EOF'",
    '[Unit]',
    'Description=Nayla Drive R2 sync',
    'After=network-online.target',
    'Wants=network-online.target',
    '[Service]',
    'Type=oneshot',
    'User=root',
    'EnvironmentFile=/etc/nayla/drive.env',
    'ExecStart=/usr/local/bin/nayla-drive-sync',
    'EOF',
    "cat > /etc/systemd/system/nayla-drive-sync.timer <<'EOF'",
    '[Unit]',
    'Description=Sync Nayla Drive to R2 every 30 seconds',
    '[Timer]',
    'OnBootSec=20s',
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
