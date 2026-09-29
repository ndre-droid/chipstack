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

/**
 * The Fold lying down: two columns, and a dialog that has to be above both.
 *
 * Its own viewport, because `data-panes='2'` is the only shape where this can
 * break — `lib/windowLayout.ts` asks for landscape, 800dp of width and 520dp of
 * height, and the phone project above is none of those.
 */
test.describe('two columns', () => {
  test.use({ viewport: { width: 1000, height: 755 } });

  test('a sheet opened from one column is above the other one', async ({ page }) => {
    /* THE regression, and it shipped. `position: sticky` creates a stacking
       context; every sheet in this app is `position: fixed` and rendered from
       inside the column it was opened from. Making both columns sticky — so each
       could scroll on its own — trapped the sheet inside the left one, and the
       right column, later in the DOM, painted its blind ladder and its TV panel
       straight across the dialog. `z-index` could not fix it: a trapped element
       cannot be raised out of its trap, which is why this asserts what is ON TOP
       at a point rather than what any z-index says. */
    await page.goto('/');
    await expect(page.locator(':root[data-panes="2"]')).toHaveCount(1);
    await seatFour(page);

    await page.locator('main.is-active').getByRole('button', { name: 'Add player' }).click();
    const sheet = page.locator('.cr-sheet');
    await expect(sheet).toBeVisible();

    // A point over the right-hand column, level with the middle of the dialog.
    const box = await sheet.boundingBox();
    if (!box) throw new Error('the sheet has no box');
    const y = Math.round(box.y + box.height / 2);
    const x = Math.round(page.viewportSize()!.width * 0.62);

    const onTop = await page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return { insideSheet: !!el?.closest('.cr-sheet'), got: el?.className ?? null };
      },
      [x, y],
    );
    expect(onTop.insideSheet, `the right column is painting over the dialog: ${onTop.got}`).toBe(true);
  });

  test('each column scrolls itself, and the page behind them does not', async ({ page }) => {
    /* The other half of the same rule: the columns are sized to the window so the
       PAGE has nothing left to scroll. When that arithmetic is wrong the outer
       scroll comes back, and a few stray pixels of it are enough to drag the
       clock strip off the top while a column is being read. */
    await page.goto('/');
    await seatFour(page);
    await armClock(page);

    const m = await page.evaluate(() => {
      const screen = document.querySelector('main.screen.is-active') as HTMLElement;
      const panes = [...screen.querySelectorAll('.panes > .pane')] as HTMLElement[];
      return {
        page: { scroll: screen.scrollHeight, client: screen.clientHeight },
        panes: panes.map((p) => ({ h: Math.round(p.getBoundingClientRect().height), content: p.scrollHeight })),
      };
    });

    expect(m.panes.length).toBe(2);
    // one pixel of slack for sub-pixel rounding of the strip's border
    expect(m.page.scroll, 'the page itself is scrolling behind the columns').toBeLessThanOrEqual(m.page.client + 1);
    for (const p of m.panes) expect(p.h, 'a column collapsed instead of filling the window').toBeGreaterThan(200);
  });
});
