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
 * A Fold lying landscape — a Fold 8 held normally. ONE page and a ~300px side
 * column, never two equal columns (tried on the device and turned down).
 *
 * Its own viewport, because `data-side='wide'` is the only shape where this can
 * break — `lib/windowLayout.ts` asks for landscape, 800dp of width and 520dp of
 * height, and the phone project above is none of those.
 */
test.describe('landscape Fold', () => {
  test.use({ viewport: { width: 932, height: 680 } });

  test('the Table opens on the players, with the clock and the stack pinned beside them', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(':root[data-side="wide"][data-layout="wide"]')).toHaveCount(1);
    await seatFour(page);
    await armClock(page);

    const m = await page.evaluate(() => {
      const screen = document.querySelector('main.screen.is-active') as HTMLElement;
      const aside = screen.querySelector('.screen-support') as HTMLElement;
      const page = screen.firstElementChild as HTMLElement;
      return {
        asideWidth: Math.round(aside.getBoundingClientRect().width),
        inAside: [...aside.children].map((c) => c.className),
        pageWidth: Math.round(page.getBoundingClientRect().width),
        stackOnPage: !!page.querySelector('.support-inline .stack-viz'),
      };
    });
    expect(m.asideWidth).toBe(300);
    expect(m.inAside.some((c) => c.includes('support-table')), 'the clock is not in the column').toBe(true);
    expect(m.inAside.some((c) => c.includes('support-stack')), 'the starting stack is not in the column').toBe(true);
    expect(m.stackOnPage, 'the starting stack was drawn on the page as well').toBe(false);
    // about a phone's width — the point of the column
    expect(m.pageWidth).toBeGreaterThan(380);
    expect(m.pageWidth).toBeLessThan(520);
  });

  test('each tab pins its answer: the plan check, the chip set, a Settings index', async ({ page }) => {
    await page.goto('/');
    const inColumn = (sel: string) =>
      page.evaluate((s) => !!document.querySelector(`main.screen.is-active .screen-support ${s}`), sel);

    await goToTab(page, 'Plan');
    expect(await inColumn('.feas'), 'the enough-chips check is not under the answer').toBe(true);

    await goToTab(page, 'Chips');
    expect(await inColumn('.set-bar'), 'the chip-set switcher is not in the column').toBe(true);

    await page.locator('.rail-gear').click();
    const index = page.locator('main.screen.is-active .screen-support .settings-index button');
    await expect(index.first()).toBeVisible();
    expect(await index.count()).toBeGreaterThan(10);
    // a jump scrolls the screen, never the document behind the sticky header
    // a middle one: the last section is too short to scroll its label to the top
    await index.nth(8).click();
    await expect(index.nth(8)).toHaveClass(/(^|\s)on(\s|$)/);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  });

  test('a sheet opened from the page is above the side column', async ({ page }) => {
    /* The regression that shipped once, kept: every sheet is `position: fixed`
       and rendered where it is opened from, so any stacking context on the way
       up traps it and a later sibling — the column — paints straight over the
       dialog. Asserted by what is ON TOP at a point, not by what z-index says. */
    await page.goto('/');
    await seatFour(page);
    await armClock(page);

    await page.locator('main.is-active').getByRole('button', { name: 'Add player' }).click();
    const sheet = page.locator('.cr-sheet');
    await expect(sheet).toBeVisible();

    const box = await sheet.boundingBox();
    if (!box) throw new Error('the sheet has no box');
    const y = Math.round(box.y + box.height / 2);
    const x = Math.round(box.x + box.width - 20); // inside the panel, over the column

    const onTop = await page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return { insideSheet: !!el?.closest('.cr-sheet'), got: el?.className ?? null };
      },
      [x, y],
    );
    expect(onTop.insideSheet, `the side column is painting over the dialog: ${onTop.got}`).toBe(true);
  });

  test('a tap beside an open dialog does not reach the app behind it', async ({ page }) => {
    /* The scrim used to be a spread box-shadow: it dimmed the app and caught
       nothing, so a tap beside the panel seated players, switched tabs on the
       rail or raised the blinds under an open modal. Anywhere outside the panel
       has to land on the sheet (its hit-target pseudo-element reports as the
       sheet itself). */
    await page.goto('/');
    await seatFour(page);
    await armClock(page);
    await page.locator('main.is-active').getByRole('button', { name: 'Add player' }).click();
    const sheet = page.locator('.cr-sheet');
    await expect(sheet).toBeVisible();

    const box = await sheet.boundingBox();
    if (!box) throw new Error('the sheet has no box');
    const { width, height } = page.viewportSize()!;
    const outside: [number, number][] = [
      [30, Math.round(height / 2)], // the rail
      [Math.round(box.x - 12), Math.round(box.y + box.height / 2)], // just left of the panel
      [width - 60, height - 20], // foot of the side column
    ];
    for (const [x, y] of outside) {
      const got = await page.evaluate(([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return { caught: !!el?.closest('.cr-sheet'), got: el?.className ?? null };
      }, [x, y] as [number, number]);
      expect(got.caught, `a tap at ${x},${y} went through the scrim to ${got.got}`).toBe(true);
    }
  });
});

/**
 * A Fold 8 held normally, with Screen zoom or three-button navigation taking
 * height: tall enough for the landscape column (520) but not for `WIDE` (600).
 * The phone's bottom tab bar floated across the page there once. A side column
 * must always come with the rail.
 */
test.describe('landscape Fold with Screen zoom', () => {
  test.use({ viewport: { width: 816, height: 580 } });

  test('the side column always comes with the rail, never the bottom tab bar', async ({ page }) => {
    await page.goto('/');
    const shape = await page.evaluate(() => ({ ...document.documentElement.dataset }));
    expect(shape.side).toBe('wide');
    expect(shape.layout, 'the page drawn under the phone tab bar').toBe('wide');
  });
});

/**
 * A video from the gallery, playing behind the big screen.
 *
 * Driven for real rather than asserted from the outside: the clip is recorded in
 * the page with MediaRecorder, handed to the app's own file input the way the
 * gallery would hand it over, and then looked for on the big screen. That covers
 * the whole path — the guard, IndexedDB, the object URL and the <video> element —
 * none of which a pure test can reach.
 */
test('a gallery video plays behind the big screen', async ({ page }) => {
  await page.goto('/');
  await seatFour(page);

  /* A real, decodable clip, made here so there is no binary fixture in the repo
     and no assumption about what the CI runner can encode. A canvas stream is the
     one video source a headless browser always has. */
  const clip = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(25);
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start();
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `hsl(${i * 20} 70% 45%)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await new Promise((r) => setTimeout(r, 40));
    }
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const b of buf) s += String.fromCharCode(b);
    return { base64: btoa(s), type: blob.type };
  });
  expect(clip.base64.length, 'MediaRecorder produced nothing to test with').toBeGreaterThan(100);

  await page.getByRole('button', { name: /TV broadcast/ }).click();
  const pick = page.locator('main.is-active input[type="file"][accept="video/*"]');
  await pick.setInputFiles({
    name: 'loop.webm',
    mimeType: clip.type || 'video/webm',
    buffer: Buffer.from(clip.base64, 'base64'),
  });

  // the picker now offers to REPLACE it, which is the app saying the id was stored
  // a <label> wrapping a hidden input, not a button — the file picker's own shape
  await expect(page.locator('main.is-active').getByText('Replace the video')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /Big screen/ }).click();
  const video = page.locator('.tv-bg-video');
  await expect(video).toHaveCount(1);
  await expect(page.locator('.tv.has-bg')).toHaveCount(1);

  /* Playing, not merely present — and muted, which is both the autoplay policy and
     the app's own rule that the big screen never makes a sound. */
  const state = await video.evaluate((el: HTMLVideoElement) => ({
    muted: el.muted,
    loop: el.loop,
    src: el.getAttribute('src')?.slice(0, 5) ?? '',
    advanced: el.currentTime > 0 || el.readyState >= 2,
  }));
  expect(state.muted, 'the big screen must never make a sound').toBe(true);
  expect(state.loop).toBe(true);
  expect(state.src, 'the blob is handed over as an object URL, never a data URL').toBe('blob:');
  expect(state.advanced, 'the video element never got as far as a frame').toBe(true);

  /* And it is BEHIND the night, not over it. `z-index: 0` rather than -1 is what
     keeps it visible at all (a negative one hides under the .tv background), which
     puts it one careless number away from covering the clock instead. Asserted by
     asking what is actually on top at the middle of the screen, the same way the
     two-column dialog is — a visibility check would not notice occlusion. */
  const overTheMiddle = await page.evaluate(() => {
    const tv = document.querySelector('.tv') as HTMLElement;
    const r = tv.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(r.width / 2), Math.round(r.height / 2));
    return { isVideo: el?.classList.contains('tv-bg-video') ?? false, got: el?.className ?? null };
  });
  expect(overTheMiddle.isVideo, `the video is painting over the big screen: ${overTheMiddle.got}`).toBe(false);
});
