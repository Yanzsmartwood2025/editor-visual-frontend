import { chromium } from 'playwright';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000/?dev=1';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];

page.on('pageerror', (error) => pageErrors.push(error.message));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const clickTextButton = async (root, text) => {
  const button = root.locator('button').filter({ hasText: text }).first();
  await button.waitFor({ state: 'visible', timeout: 30_000 });
  await button.click();
};

const testEngine = async (dialog, engine) => {
  await clickTextButton(dialog.locator('.generar-engine-grid'), engine);
  const moduleGrid = dialog.locator('.generar-module-grid');
  await moduleGrid.waitFor({ state: 'visible', timeout: 30_000 });

  const moduleIds = {
    IMAGEN: 'imagen',
    VIDEO: 'video',
    AUDIO: 'audio',
    'MÚSICA': 'musica',
    '3D': '3d',
  };

  for (const moduleName of ['IMAGEN', 'VIDEO', 'AUDIO', 'MÚSICA', '3D']) {
    await clickTextButton(moduleGrid, moduleName);
    const moduleRoot = dialog.locator(`[data-generar-module="${moduleIds[moduleName]}"]`);
    await moduleRoot.waitFor({ state: 'visible', timeout: 30_000 });

    if (engine === 'API' && moduleName === 'AUDIO') {
      await moduleRoot.getByText('NAYLA AUDIO', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
      await moduleRoot.getByRole('button', { name: 'Abrir menú de audio' }).click();

      const drawer = moduleRoot.getByRole('dialog', { name: 'Menú de Nayla Audio' });
      await drawer.waitFor({ state: 'visible', timeout: 30_000 });
      await drawer.getByRole('button', { name: /Voces/ }).first().waitFor({ state: 'visible' });
      await drawer.getByRole('button', { name: /Clonar voz/ }).waitFor({ state: 'visible' });
      await drawer.getByRole('button', { name: /Sonidos/ }).waitFor({ state: 'visible' });
      await drawer.getByRole('button', { name: 'Cerrar menú' }).click();

      const returnButton = moduleRoot.getByRole('button', { name: /REGRESAR A NAYLA/ });
      await returnButton.waitFor({ state: 'visible', timeout: 30_000 });
      await returnButton.click();
      await dialog.waitFor({ state: 'hidden', timeout: 30_000 });

      const generateButton = page.locator('button[title="GENERAR"]');
      await generateButton.waitFor({ state: 'visible', timeout: 30_000 });
      await generateButton.click();
      await dialog.waitFor({ state: 'visible', timeout: 30_000 });
      await clickTextButton(dialog.locator('.generar-engine-grid'), 'API');
      await moduleGrid.waitFor({ state: 'visible', timeout: 30_000 });
      continue;
    }

    await dialog.getByRole('button', { name: `Volver a ${engine}` }).click();
    await moduleGrid.waitFor({ state: 'visible', timeout: 30_000 });
  }
};

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const generateButton = page.locator('button[title="GENERAR"]');
  await generateButton.waitFor({ state: 'visible', timeout: 30_000 });
  await generateButton.click();

  const dialog = page.locator('.generar-workspace[role="dialog"]');
  await dialog.waitFor({ state: 'visible', timeout: 30_000 });

  await testEngine(dialog, 'API');
  await dialog.getByRole('button', { name: 'Volver' }).click();

  await testEngine(dialog, 'GPU');

  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 30_000 });

  assert(pageErrors.length === 0, `Errores no controlados del navegador: ${pageErrors.join(' | ')}`);
  console.log('Playwright smoke OK: GENERAR → API/GPU → 5 módulos + AUDIO inmersivo → volver/cerrar.');
} finally {
  await browser.close();
}
