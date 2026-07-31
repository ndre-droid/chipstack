import { useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { ChipCountSheet } from './ChipCountSheet';

/**
 * Always-visible entry point for the photo chip-count on the Table tab — works
 * in BOTH game modes and needs no live TV session (unlike the host RemoteControl
 * panel, which is where the per-row 📷 also appears while hosting). Lists the
 * ledger players; 📷 opens the capture sheet and writes that player's chip count.
 */
export default function ChipCountCard() {
  const { state, dispatch } = useStore();
  const t = useT();
  const { num } = useFmt();
  const ledger = state.ledger;
  const playerCount = state.session.playerCount;
  const [countFor, setCountFor] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: ledger.length ? 8 : 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>📷 {t('chipcount.title')}</div>
          <div className="faint" style={{ fontSize: 12.5 }}>{t('chipcount.cardHint')}</div>
        </div>
      </div>

      {ledger.length === 0 ? (
        <button
          className="btn btn-primary btn-block"
          onClick={() => dispatch({ type: 'LEDGER_ADD_MANY', n: playerCount })}
        >
          {t('chipcount.addPlayers').replace('{n}', String(playerCount))}
        </button>
      ) : (
        <div className="cc-players">
          {ledger.map((p) => (
            <div key={p.id} className="cc-player-row">
              <span className="cc-player-name">
                {p.emoji ? p.emoji + ' ' : ''}
                {p.name || 'Player'}
              </span>
              <span className="cc-player-chips">{p.chips ? num(p.chips) : '—'}</span>
              <button
                type="button"
                className="icon-btn cc-open"
                aria-label={t('chipcount.title')}
                onClick={() => setCountFor({ id: p.id, name: p.name })}
              >
                📷
              </button>
            </div>
          ))}
        </div>
      )}

      {countFor && (
        <ChipCountSheet
          playerId={countFor.id}
          playerName={countFor.name}
          onClose={() => setCountFor(null)}
        />
      )}
    </div>
  );
}
