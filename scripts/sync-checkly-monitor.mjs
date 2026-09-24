import crypto from 'crypto';

const apiKey = process.env.CHECKLY_API_KEY;
const accountId = process.env.CHECKLY_ACCOUNT_ID;
const targetUrl = process.env.CHECKLY_TARGET_URL || 'https://editor-visual-frontend-cauc.vercel.app/';
const diagnosticsBaseUrl = process.env.DIAGNOSTICS_BASE_URL || targetUrl.replace(/\/$/, '');
const monitorName = 'Editor Nayla - Producción';
const alertName = 'Nayla Diagnostics Realtime';

if (!apiKey || !accountId) {
  throw new Error('Faltan CHECKLY_API_KEY o CHECKLY_ACCOUNT_ID.');
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  'X-Checkly-Account': accountId,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const checkly = async (path, init = {}) => {
  const response = await fetch(`https://api.checklyhq.com${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  if (!response.ok) {
    throw new Error(`Checkly ${path}: ${response.status} ${await response.text()}`);
  }
  if (response.status === 204) return null;
  return response.json();
};

const checks = await checkly('/v1/checks?limit=100');
let monitor = Array.isArray(checks) ? checks.find((check) => check?.name === monitorName) : null;

if (!monitor) {
  monitor = await checkly('/v1/checks/api?autoAssignAlerts=true', {
    method: 'POST',
    body: JSON.stringify({
      activated: true,
      muted: false,
      shouldFail: false,
      alertSettings: {
        escalationType: 'RUN_BASED',
        reminders: { amount: 0, interval: 5 },
        runBasedEscalation: { failedRunThreshold: 1 },
        parallelRunFailureThreshold: { enabled: false, percentage: 10 },
      },
      useGlobalAlertSettings: true,
      groupId: null,
      groupOrder: null,
      runtimeId: null,
      retryStrategy: {
        type: 'FIXED',
        baseBackoffSeconds: 60,
        maxRetries: 2,
        maxDurationSeconds: 600,
        sameRegion: true,
      },
      runParallel: false,
      request: {
        method: 'GET',
        url: targetUrl,
        skipSSL: false,
        ipFamily: 'IPv4',
        bodyType: 'NONE',
      },
      frequency: 10,
      tearDownSnippetId: null,
      setupSnippetId: null,
      localSetupScript: null,
      localTearDownScript: null,
      degradedResponseTime: 10_000,
      maxResponseTime: 20_000,
      name: monitorName,
      locations: ['us-east-1'],
    }),
  });
  console.log(`Monitor Checkly creado: ${monitor?.name || monitorName}.`);
} else {
  console.log(`Monitor Checkly existente: ${monitor.id}.`);
}

const callbackSecret = crypto.randomBytes(32).toString('hex');

const registerUrl = `${diagnosticsBaseUrl}/api/diagnostics/checkly/register`;
let registered = false;
let lastRegisterError = '';

for (let attempt = 1; attempt <= 30; attempt++) {
  try {
    const response = await fetch(registerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, accountId, callbackSecret }),
    });
    if (response.ok) {
      registered = true;
      break;
    }
    lastRegisterError = `${response.status} ${await response.text()}`;
  } catch (error) {
    lastRegisterError = String(error?.message || error);
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

if (!registered) {
  throw new Error(`No se pudo registrar el webhook en producción: ${lastRegisterError}`);
}

const channelBody = {
  type: 'WEBHOOK',
  config: {
    name: alertName,
    url: `${diagnosticsBaseUrl}/api/diagnostics/ingest/checkly`,
    method: 'POST',
    template: JSON.stringify({
      alertType: '{{ALERT_TYPE}}',
      checkName: '{{CHECK_NAME}}',
      title: '{{ALERT_TITLE}}',
      resultLink: '{{RESULT_LINK}}',
    }),
    headers: [
      { key: 'Authorization', value: `Bearer ${callbackSecret}` },
      { key: 'Content-Type', value: 'application/json' },
    ],
  },
  sendRecovery: true,
  sendFailure: true,
  sendDegraded: true,
  sslExpiry: false,
  sslExpiryThreshold: 30,
};

const channels = await checkly('/v1/alert-channels?limit=100&page=1');
let channel = Array.isArray(channels)
  ? channels.find((item) => item?.type === 'WEBHOOK' && item?.config?.name === alertName)
  : null;

if (channel?.id) {
  channel = await checkly(`/v1/alert-channels/${channel.id}`, {
    method: 'PUT',
    body: JSON.stringify(channelBody),
  });
  console.log(`Webhook Checkly actualizado: ${channel.id}.`);
} else {
  channel = await checkly('/v1/alert-channels', {
    method: 'POST',
    body: JSON.stringify(channelBody),
  });
  console.log(`Webhook Checkly creado: ${channel?.id}.`);
}

if (!channel?.id || !monitor?.id) {
  throw new Error('Checkly no devolvió IDs válidos para monitor/webhook.');
}

await checkly(`/v1/alert-channels/${channel.id}/subscriptions`, {
  method: 'PUT',
  body: JSON.stringify({ activated: true, checkId: monitor.id }),
});

const playwrightResult = process.env.PLAYWRIGHT_RESULT || 'unknown';
const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : '';

const ciResponse = await fetch(`${diagnosticsBaseUrl}/api/diagnostics/ingest/ci`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${callbackSecret}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    result: playwrightResult,
    commitSha: process.env.GITHUB_SHA || '',
    runUrl,
  }),
});

if (!ciResponse.ok) {
  throw new Error(`No se pudo publicar el resultado Playwright: ${ciResponse.status} ${await ciResponse.text()}`);
}

console.log('Checkly + webhook en vivo + resultado Playwright sincronizados.');
