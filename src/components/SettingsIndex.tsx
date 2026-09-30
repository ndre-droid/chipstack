import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';

/**
 * A jump list of the Settings page, for the side column on a landscape Fold.
 *
 * Read off the page's own `.section-label`s rather than kept as a second list:
 * sections come and go (Appearance only exists on the minimal skin), the labels
 * are translated, and a hand-kept index would drift from all of that the first
 * time somebody adds a section. A MutationObserver re-reads them when the page
 * changes — a language switch rewrites every label.
 *
 * The highlighted entry is the last section whose label has scrolled past the
 * top of the screen, so it answers "where am I" as well as "take me to".
 *
 * Only ever mounted inside the column (`<Support columnOnly>`), so it finds its
 * page through its own `<main class="screen">`.
 */
interface Entry {
  label: string;
  el: HTMLElement;
}

function labelText(el: HTMLElement): string {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.hint').forEach((h) => h.remove());
  return copy.textContent?.trim() ?? '';
}

export default function SettingsIndex() {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const screen = ref.current?.closest('main.screen') as HTMLElement | null;
    if (!screen) return;
    /* Looked up on every read, and the whole screen observed rather than the page:
       on a cold start straight into Settings the page element is replaced after
       this mounts, and an observer on the first one watched a detached node. The
       aside is excluded so the index never lists itself. */
    const labels = () => [...screen.querySelectorAll<HTMLElement>(':scope > :not(.screen-support) .section-label')];

    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const found = labels()
          .map((el) => ({ label: labelText(el), el }))
          .filter((e) => e.label);
        // the index is inside the observed subtree: only a real change may render
        setEntries((prev) =>
          prev.length === found.length && prev.every((e, i) => e.el === found[i].el && e.label === found[i].label) ? prev : found,
        );
      });
    };
    const spy = () => {
      const top = screen.getBoundingClientRect().top + 60;
      let i = 0;
      labels().forEach((el, n) => {
        if (el.getBoundingClientRect().top <= top) i = n;
      });
      setActive(i);
    };

    read();
    spy();
    const mo = new MutationObserver(read);
    mo.observe(screen, { childList: true, subtree: true, characterData: true });
    screen.addEventListener('scroll', spy, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      screen.removeEventListener('scroll', spy);
    };
  }, []);

  /* The screen is scrolled directly, never with `scrollIntoView`: that scrolls
     EVERY scrollable ancestor, and the document itself has a few pixels to give,
     so the whole app slid up under its own sticky header. */
  const jump = (el: HTMLElement) => {
    const screen = ref.current?.closest('main.screen') as HTMLElement | null;
    if (!screen) return;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = screen.scrollTop + el.getBoundingClientRect().top - screen.getBoundingClientRect().top - 12;
    screen.scrollTo({ top, behavior: calm ? 'auto' : 'smooth' });
  };

  return (
    <nav className="settings-index" ref={ref} aria-label={t('settings.index')}>
      {entries.map((e, i) => (
        <button key={i} className={i === active ? 'on' : ''} onClick={() => jump(e.el)} aria-current={i === active ? 'true' : undefined}>
          {e.label}
        </button>
      ))}
    </nav>
  );
}
