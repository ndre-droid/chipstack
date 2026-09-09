import { expect, test, type Page } from '@playwright/test';

/**
 * The night, start to finish, in a real browser.
 *
 * Every test here exists because the equivalent already broke once. They are
 * deliberately shallow — this is the tripwire that says "the app still runs", not a
 * spec of the UI. Anything that can be decided from a pure function belongs in
 * `src/lib/*.test.ts` instead, where it costs milliseconds.
 *
 * Selectors are accessible names wherever the app has them, because the inactive tabs
 * stay mounted under `aria-hidden` (see the ScreenStore in store.tsx) and the role
 * queries therefore only ever see the screen that is on top.
 */

/** The bottom nav, which is the only reliable way between screens. */
async function goToTab(page: Page, name: 'Plan' | 'Chips' | 'Table' | 'Cash') {
  await page.locator('nav.bottom-nav button', { hasText: name }).click();
}

/** Seat four players — the shortcut the Table tab offers an empty table. */
async function seatFour(page: Page) {
  await goToTab(page, 'Table');
  await page.getByRole('button', { name: 'Start with 4 players' }).click();
  await expect(page.getByRole('button', { name: 'Add player' })).toBeVisible();
}

/** Turn the blind timer on, which is what puts the clock strip on screen. Idempotent:
 *  the setting is a device setting and may already be on. */
async function armClock(page: Page) {
  const strip = page.locator('.table-sticky');
  if (await strip.isVisible()) return;
  await page.getByRole('button', { name: /Table setup/ }).click();
  const timer = page.getByRole('switch', { name: 'Run a blind timer' });
  if ((await timer.getAttribute('aria-checked')) !== 'true') await timer.click();
  await expect(strip).toBeVisible();
}

const mmss = /(\d+):(\d\d)/;
async function clockSeconds(page: Page): Promise<number> {
  const text = (await page.locator('.table-sticky').innerText()) ?? '';
  const m = text.match(mmss);
  if (!m) throw new Error(`no clock in the strip: ${JSON.stringify(text)}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

test('the app boots, and boots clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');

  for (const tab of ['Plan', 'Chips', 'Table', 'Cash']) {
    await expect(page.locator('nav.bottom-nav button', { hasText: tab })).toBeVisible();
  }
  // The crash screen must not be what a healthy boot looks like.
  await expect(page.locator('.crash')).toHaveCount(0);
  expect(errors, `console errors on a clean boot:\n${errors.join('\n')}`).toEqual([]);
});

test('a fresh install already answers the question the app is for', async ({ page }) => {
  await page.goto('/');
  // The whole point of the Plan screen: a stack, built from the default chip set,
  // that adds up to the buy-in exactly. If the engine is not wired to the screen this
  // is the first thing to go.
  await expect(page.getByText('Each player starts with')).toBeVisible();
  const summary = await page.locator('main.is-active').getByText(/denominations?$/).first().innerText();
  expect(summary).toMatch(/€\d+ · [\d,.]+ pts · \d+ denominations?/);
  await expect(page.locator('main.is-active').getByText('Balances to the buy-in')).toBeVisible();
});

test('players can be seated, and they survive a reload', async ({ page }) => {
  await page.goto('/');
  await seatFour(page);
  const rows = page.locator('main.is-active').getByRole('button', { name: 'Edit name' });
  await expect(rows).toHaveCount(4);

  // The store writes through to localStorage; the origin is the identity of the data
  // (see the persistence notes in HANDOFF.md), so a reload must find the same table.
  await page.reload();
  await expect(page.locator('main.is-active').getByRole('button', { name: 'Edit name' })).toHaveCount(4);
});

test('the clock keeps running across a tab change', async ({ page }) => {
  // THE regression. The blind clock used to live in TableScreen state, and App remounts
  // the screen on every tab change — which reset the timer AND stopped it, mid-level,
  // whenever anybody looked at the ledger. It lives outside React now (lib/localClock).
  await page.goto('/');
  await seatFour(page);
  await armClock(page);

  await page.getByRole('button', { name: 'Start the clock' }).click();
  await page.waitForTimeout(1500);
  const before = await clockSeconds(page);
  expect(before).toBeLessThan(20 * 60); // it actually started

  await goToTab(page, 'Cash');
  await page.waitForTimeout(1500);
  await goToTab(page, 'Table');

  const after = await clockSeconds(page);
  expect(after, 'the clock was reset by the tab change').toBeLessThan(20 * 60);
  expect(after, 'the clock stopped while another tab was open').toBeLessThan(before);
});

test('a crash lands on the recovery screen, not a white page', async ({ page }) => {
  // `?crash=1` throws inside App on purpose (see App.tsx) — the only way to see this
  // screen on a device that cannot be given a debugger.
  await page.goto('/?crash=1');

  const crash = page.locator('.crash');
  await expect(crash).toBeVisible();
  await expect(crash.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(crash.getByRole('button', { name: 'Reload' })).toBeVisible();
  await expect(crash.getByRole('button', { name: 'Get the latest version' })).toBeVisible();
  await expect(crash.getByRole('button', { name: 'Save my data' })).toBeVisible();

  // Destructive, so it takes two taps and says so in between.
  const fresh = crash.getByRole('button', { name: 'Start fresh' });
  await fresh.click();
  await expect(crash.getByRole('button', { name: 'Tap again to confirm' })).toBeVisible();
});

test('the recovery screen hands back the data it could not draw', async ({ page }) => {
  await page.goto('/');
  await seatFour(page); // something worth saving is now on disk

  await page.goto('/?crash=1');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^chipstack-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.locator('.crash-hint.good')).toBeVisible();
});
