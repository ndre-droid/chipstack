import { useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { IconChevron } from './Icons';

const ICON: Record<string, string> = {
  join: '🪑',
  buyin: '💶',
  cashout: '🏁',
  bust: '💀',
  count: '🧮',
  level: '⏱',
};

/**
 * What happened tonight, in order.
 *
 * Settles the two arguments a home game always has — "did I rebuy twice or three
 * times?" and "when did she actually go out?" — without anybody having to keep
 * notes. Collapsed by default: it is for looking something up, not for staring at.
 */
export default function Timeline() {
  const { state } = useStore();
  const t = useT();
  const { money } = useFmt();
  const [open, setOpen] = useState(false);
  const cur = state.settings.currency;
  const unit = state.settings.unitValue || 0.01;

  if (state.timeline.length === 0) return null;

  const time = (at: number) =>
    new Date(at).toLocaleTimeString(state.settings.language === 'de' ? 'de-DE' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const label = (e: (typeof state.timeline)[number]) => {
    const name = e.name ?? '';
    switch (e.kind) {
      case 'join':
        return t('timeline.join', { name, amount: money(e.amount ?? 0, cur) });
      case 'buyin':
        return t('timeline.buyin', { name, amount: money(e.amount ?? 0, cur) });
      case 'cashout':
        return t('timeline.cashout', { name, amount: money(e.amount ?? 0, cur) });
      case 'bust':
        return t('timeline.bust', { name });
      case 'count':
        return t('timeline.count', { amount: money((e.amount ?? 0) * unit, cur) });
      default:
        return name;
    }
  };

  return (
    <>
      <button className="section-label collapsible-head" onClick={() => setOpen((v) => !v)}>
        {t('timeline.title')}
        <span className="hint">{t('timeline.hint', { n: state.timeline.length })}</span>
        <span className={`chevron ${open ? 'rot90' : ''}`} style={{ marginLeft: 8 }}>
          <IconChevron size={16} />
        </span>
      </button>
      {open && (
        <div className="card">
          <div className="tl-list">
            {[...state.timeline].reverse().map((e) => (
              <div className="tl-row" key={e.id}>
                <span className="tl-time">{time(e.at)}</span>
                <span className="tl-icon">{ICON[e.kind] ?? '•'}</span>
                <span className="tl-txt">
                  {e.emoji ? `${e.emoji} ` : ''}
                  {label(e)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
