const apiKey = process.env.CHECKLY_API_KEY;
const accountId = process.env.CHECKLY_ACCOUNT_ID;
const targetUrl = process.env.CHECKLY_TARGET_URL || 'https://editor-visual-frontend-cauc.vercel.app/';
const monitorName = 'Editor Nayla - Producción';

if (!apiKey || !accountId) {
  throw new Error('Faltan CHECKLY_API_KEY o CHECKLY_ACCOUNT_ID.');
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  'X-Checkly-Account': accountId,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const listResponse = await fetch('https://api.checklyhq.com/v1/checks?limit=100', { headers });
if (!listResponse.ok) {
  throw new Error(`No se pudo consultar Checkly: ${listResponse.status} ${await listResponse.text()}`);
}

const checks = await listResponse.json();
const existing = Array.isArray(checks) ? checks.find((check) => check?.name === monitorName) : null;

if (existing) {
  console.log(`Checkly ya tiene el monitor "${monitorName}" (${existing.id}).`);
  process.exit(0);
}

const body = {
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
};

const createResponse = await fetch('https://api.checklyhq.com/v1/checks/api?autoAssignAlerts=true', {
  method: 'POST',
  headers,
  body: JSON.stringify(body),
});

if (!createResponse.ok) {
  throw new Error(`No se pudo crear el monitor Checkly: ${createResponse.status} ${await createResponse.text()}`);
}

const created = await createResponse.json();
console.log(`Monitor Checkly creado: ${created?.name || monitorName}.`);
