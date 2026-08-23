import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { IconTrash } from './Icons';
import SeasonStats from './SeasonStats';

interface Standing {
  name: string;
  games: number;
  buyIn: number;
  cashOut: number;
  net: number;
  roi: number; // net / buyIn
}

/**
 * Season league on the Cash tab: snapshot the current night into a persistent
 * history, then rank every player across all saved nights by net profit (with ROI).
 * Purely local, survives updates via the store's migrate().
 */
export default function SeasonLeague() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money } = useFmt();
  const cur = state.settings.currency;
  const [showHistory, setShowHistory] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const league = state.league;
  const canSave = state.ledger.some((p) => (p.buyIn || 0) > 0 || (p.cashOut || 0) > 0);

  const standings = useMemo<Standing[]>(() => {
    const by = new Map<string, Standing>();
    for (const g of league) {
      for (const p of g.players) {
        const key = p.name.trim().toLowerCase() || 'player';
        const s = by.get(key) ?? { name: p.name || 'Player', games: 0, buyIn: 0, cashOut: 0, net: 0, roi: 0 };
        s.games += 1;
        s.buyIn += p.buyIn || 0;
        s.cashOut += p.cashOut || 0;
        s.net = s.cashOut - s.buyIn;
        by.set(key, s);
      }
    }
    const arr = [...by.values()];
    for (const s of arr) s.roi = s.buyIn > 0 ? s.net / s.buyIn : 0;
    return arr.sort((a, b) => b.net - a.net);
  }, [league]);

  const saveNight = () => {
    dispatch({ type: 'LEAGUE_SAVE_GAME' });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(state.settings.language === 'de' ? 'de-DE' : 'en-US', { dateStyle: 'medium' }).format(new Date(ms));

  return (
    <>
      <div className="section-label">
        {t('league.title')}
        <span className="hint">{league.length ? t('league.nights', { n: league.length }) : t('league.empty')}</span>
      </div>
      <div className="card">
        <button className="btn btn-primary btn-block btn-sm" onClick={saveNight} disabled={!canSave}>
          {justSaved ? t('league.saved') : t('league.saveNight')}
        </button>
        {!canSave && <div className="faint" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 6 }}>{t('league.saveHint')}</div>}

        {standings.length > 0 && (
          <>
            <div className="league-table mt12">
              <div className="league-h">
                <span className="league-c-rank">#</span>
                <span className="league-c-name">{t('league.player')}</span>
                <span className="league-c-num">{t('league.games')}</span>
                <span className="league-c-num">{t('league.net')}</span>
                <span className="league-c-num">ROI</span>
              </div>
              {standings.map((s, i) => (
                <div className="league-row" key={s.name + i}>
                  <span className="league-c-rank">{i === 0 ? '👑' : i + 1}</span>
                  <span className="league-c-name">{s.name}</span>
                  <span className="league-c-num">{s.games}</span>
                  <span className={`league-c-num ${s.net >= 0 ? 'pos' : 'neg'}`}>{s.net >= 0 ? '+' : '−'}{money(Math.abs(s.net), cur)}</span>
                  <span className={`league-c-num ${s.roi >= 0 ? 'pos' : 'neg'}`}>{s.roi >= 0 ? '+' : '−'}{Math.abs(Math.round(s.roi * 100))}%</span>
                </div>
              ))}
            </div>

            <button className="mins-toggle mt12" onClick={() => setShowHistory((v) => !v)}>
              <span>{t('league.history')}</span>
              <span className={`chevron ${showHistory ? 'rot90' : ''}`}>▸</span>
            </button>
            {showHistory && (
              <div className="league-history">
                {league.map((g) => {
                  const pot = g.players.reduce((a, p) => a + (p.buyIn || 0), 0);
                  return (
                    <div className="league-game" key={g.id}>
                      <div className="league-game-h">
                        <span>{fmtDate(g.date)} · {g.players.length} {t('cash.players').toLowerCase()} · {money(pot, g.currency)}</span>
                        <button className="icon-btn danger" style={{ width: 28, height: 28 }} onClick={() => dispatch({ type: 'LEAGUE_DELETE_GAME', id: g.id })} aria-label="Delete">
                          <IconTrash size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <SeasonStats />
    </>
  );
}
