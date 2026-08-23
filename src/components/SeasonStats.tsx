import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { headToHead, seasonStats } from '../lib/leagueStats';
import { IconChevron } from './Icons';
import { renderSettlementImage } from '../lib/share';

/**
 * The part of the season people actually talk about: who is up, who has been paying
 * for everyone, the biggest single night, and the head-to-head that settles an
 * argument. All of it is already in the saved games — it just was not being counted.
 */
export default function SeasonStats() {
  const { state } = useStore();
  const t = useT();
  const { money } = useFmt();
  const cur = state.settings.currency;
  const [open, setOpen] = useState(false);
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => seasonStats(state.league), [state.league]);
  const h2h = useMemo(() => (a && b && a !== b ? headToHead(state.league, a, b) : null), [state.league, a, b]);

  if (stats.nights === 0) return null;

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(state.settings.language === 'de' ? 'de-DE' : 'en-US', { dateStyle: 'medium' }).format(
      new Date(ms),
    );

  /* The season as one picture. Everything in it is already on this screen — the
     point is that it can leave the phone and land in the group chat. */
  const shareSeason = async () => {
    const title = t('wrapped.title');
    const subtitle = t('wrapped.subtitle', { n: stats.nights, amount: money(stats.totalPot, cur) });
    const text = [
      `${title} — ${subtitle}`,
      '',
      ...stats.players.map((p) => `${p.name}: ${p.net >= 0 ? '+' : ''}${money(p.net, cur)} (${p.nights})`),
    ].join('\n');
    try {
      const dataUrl = renderSettlementImage({
        title,
        subtitle,
        nets: stats.players.map((p) => ({ name: p.name, net: p.net })),
        transfers: [],
        format: (n) => money(n, cur),
        paysLabel: '',
        netLabel: t('league.title'),
        payLabel: '',
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'chipstack-season.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title, text });
        return;
      }
    } catch {
      /* refused or unsupported — fall through */
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const pickName = (name: string) => {
    if (a === name) return setA(null);
    if (b === name) return setB(null);
    if (!a) return setA(name);
    if (!b) return setB(name);
    setA(b);
    setB(name);
  };

  return (
    <>
      <button className="section-label collapsible-head" onClick={() => setOpen((v) => !v)}>
        {t('league.stats')}
        <span className="hint">{t('league.statsHint', { n: stats.nights })}</span>
        <span className={`chevron ${open ? 'rot90' : ''}`} style={{ marginLeft: 8 }}>
          <IconChevron size={16} />
        </span>
      </button>
      {open && (
        <div className="card">
          <div className="stat-row">
            <div className="stat">
              <div className="k">{t('league.totalPot')}</div>
              <div className="v">{money(stats.totalPot, cur)}</div>
            </div>
            {stats.biggestNight && (
              <div className="stat">
                <div className="k">{t('league.biggestNight')}</div>
                <div className="v pos">+{money(stats.biggestNight.net, cur)}</div>
              </div>
            )}
          </div>

          <div className="ss-badges">
            {stats.shark && (
              <div className="ss-badge">
                <span className="ss-badge-k">🦈 {t('league.shark')}</span>
                <span className="ss-badge-v">{stats.shark.name} · +{money(stats.shark.net, cur)}</span>
              </div>
            )}
            {stats.donor && (
              <div className="ss-badge">
                <span className="ss-badge-k">🏦 {t('league.donor')}</span>
                <span className="ss-badge-v">{stats.donor.name} · {money(stats.donor.net, cur)}</span>
              </div>
            )}
            {stats.mostLoyal && (
              <div className="ss-badge">
                <span className="ss-badge-k">📅 {t('league.loyal')}</span>
                <span className="ss-badge-v">{stats.mostLoyal.name} · {stats.mostLoyal.nights}</span>
              </div>
            )}
            {stats.biggestNight && (
              <div className="ss-badge">
                <span className="ss-badge-k">💥 {t('league.biggestNight')}</span>
                <span className="ss-badge-v">
                  {stats.biggestNight.name} · {fmtDate(stats.biggestNight.date)}
                </span>
              </div>
            )}
          </div>

          <div className="divider" />

          {/* Tap two names to compare them. Deliberately not a pair of dropdowns —
              this is a thing people do mid-argument, not a report they configure. */}
          <div className="ss-h2h-head">
            {t('league.h2h')}
            <span className="faint">{a && b ? '' : t('league.h2hPick')}</span>
          </div>
          <div className="ss-names">
            {stats.players.map((p) => (
              <button
                key={p.key}
                className={`ss-name ${a === p.name ? 'a' : ''} ${b === p.name ? 'b' : ''}`}
                onClick={() => pickName(p.name)}
              >
                {p.name}
              </button>
            ))}
          </div>
          {h2h && h2h.nights > 0 && (
            <div className="ss-h2h">
              <div className="ss-h2h-line">
                {t('league.h2hLine', { a: a!, x: h2h.aAhead, y: h2h.bAhead, b: b!, n: h2h.nights })}
              </div>
              <div className={`ss-h2h-swing ${h2h.swing === 0 ? '' : h2h.swing > 0 ? 'pos' : 'neg'}`}>
                {h2h.swing === 0
                  ? t('league.h2hEven')
                  : t('league.h2hSwing', {
                      name: h2h.swing > 0 ? a! : b!,
                      amount: money(Math.abs(h2h.swing), cur),
                    })}
              </div>
            </div>
          )}

          <div className="divider" />

          <div className="ss-players">
            {stats.players.map((p) => (
              <div className="ss-player" key={p.key}>
                <span className="ss-player-name">{p.name}</span>
                <span className="ss-player-meta">
                  {t('league.wins', { n: p.wins })}
                  {p.streak >= 2 && ` · ${t('league.streakWin', { n: p.streak })}`}
                  {p.streak <= -2 && ` · ${t('league.streakLoss', { n: -p.streak })}`}
                </span>
                <span className="ss-player-avg">
                  {p.average >= 0 ? '+' : ''}{money(p.average, cur)} <i>{t('league.perNight')}</i>
                </span>
              </div>
            ))}
          </div>

          <button className="btn btn-ghost btn-block btn-sm mt12" onClick={() => void shareSeason()}>
            ↗ {copied ? t('settle.copied') : t('wrapped.share')}
          </button>
        </div>
      )}
    </>
  );
}
