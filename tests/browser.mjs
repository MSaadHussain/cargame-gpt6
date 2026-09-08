import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') console.log('Browser console:', m.text()); });
try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__oversteer);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'artifacts/desktop.png' });
  const start = await page.evaluate(() => window.__oversteer.snapshot());
  await page.keyboard.down('w'); await page.waitForTimeout(2500); await page.keyboard.up('w');
  const driven = await page.evaluate(() => window.__oversteer.snapshot());
  assert.ok(driven.position.z < start.position.z - 2, 'keyboard accelerates actual car');
  await page.keyboard.press('c'); assert.equal((await page.evaluate(() => window.__oversteer.snapshot())).camera, 'cockpit');
  await page.screenshot({ path: 'artifacts/cockpit.png' });
  await page.keyboard.press('Escape'); assert.ok(await page.locator('#pause-dialog').isVisible());
  const paused = await page.evaluate(() => window.__oversteer.snapshot()); await page.waitForTimeout(500);
  assert.deepEqual((await page.evaluate(() => window.__oversteer.snapshot())).position, paused.position);
  await page.click('#resume-button'); await page.keyboard.press('r'); await page.keyboard.press('c');
  await page.click('#garage-button'); await page.click('[data-name="Oxide red"]'); assert.equal(await page.locator('#paint-name').textContent(), 'Oxide red');
  await page.click('[data-name="Sage metallic"]'); await page.locator('#garage-dialog [data-close]').click();
  await page.click('#settings-button'); await page.selectOption('#units', 'mph'); await page.locator('#settings-dialog [data-close]').click();
  assert.equal(await page.locator('#speed-unit').textContent(), 'MPH');
  await page.click('#trial-mode'); assert.ok(await page.locator('#trial-panel').isVisible());
  await page.screenshot({ path: 'artifacts/trial.png' });
  await page.click('#free-mode');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
  await page.screenshot({ path: 'artifacts/mobile.png' });
  assert.ok(await page.locator('[data-control="forward"]').isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.deepEqual(errors, []);
  console.log('Browser smoke checks passed.', { start, driven, errors });
} finally { await browser.close(); }
