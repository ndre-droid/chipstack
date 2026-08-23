import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { nightAwards } from '../lib/awards';
import { renderSettlementImage } from '../lib/share';

/**
 * The end-of-night titles.
 *
 * Everything here is derived from data the app was already collecting and never
 * reading back — the counting-round trail, the timeline, the ledger. A leaderboard
 * says who won; this says what happened, which is the part that gets posted in the
 * group chat.
 */
export default function NightAwards() {
  const { state } = useStore();
  const t = useT();
  const { money } = useFmt();
  const cur = state.settings.currency;
  const [copied, setCopied] = useState(false);

  const awards = useMemo(
    () =>
      nightAwards({
        ledger: state.ledger,
        timeline: state.timeline,
        unitValue: state.settings.unitValue || 0.01,
        bounty: !!state.settings.bountyMode && state.settings.gameMode !== 'cash',
      }),
    [state.ledger, state.timeline, state.settings.unitValue, state.settings.bountyMode, state.settings.gameMode],
  );

  if (awards.length === 0) return null;

  const detail = (a: (typeof awards)[number]) =>
    t(a.detailKey, { amount: money(a.value, cur), n: a.value });

  const share = async () => {
    const date = new Date().toLocaleDateString(state.settings.language === 'de' ? 'de-DE' : 'en-GB');
    const title = `${t('award.title')} — ${date}`;
    const text = [title, '', ...awards.map((a) => `${a.icon} ${t(a.key)}: ${a.name} — ${detail(a)}`)].join('\n');
    try {
      const dataUrl = renderSettlementImage({
        title: t('award.title'),
        subtitle: date,
        // the awards reuse the settlement layout: name on the left, figure on the
        // right. `net` is only used for colour and text here.
        nets: awards.map((a) => ({ name: `${a.icon} ${a.name}`, net: a.value })),
        transfers: [],
        format: () => '',
        paysLabel: '',
        netLabel: t('award.title'),
        payLabel: '',
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'chipstack-titles.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title, text });
        return;
      }
    } catch {
      /* refused or unsupported — the clipboard is the fallback */
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="section-label">
        {t('award.title')}
        <span className="hint">{t('award.hint')}</span>
      </div>
      <div className="card">
        {awards.map((a) => (
          <div className="award-row" key={a.id}>
            <span className="award-ic">{a.icon}</span>
            <div className="award-text">
              <div className="award-k">{t(a.key)}</div>
              <div className="award-d">{detail(a)}</div>
            </div>
            <span className="award-who">
              {a.emoji ? `${a.emoji} ` : ''}
              {a.name}
            </span>
          </div>
        ))}
        <button className="btn btn-ghost btn-block btn-sm mt12" onClick={() => void share()}>
          ↗ {copied ? t('settle.copied') : t('award.share')}
        </button>
      </div>
    </>
  );
}
