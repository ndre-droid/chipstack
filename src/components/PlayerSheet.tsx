import { useState } from 'react';
import { useStore } from '../store';
import { useT, useFmt } from '../lib/i18n';
import { moneyToUnits } from '../lib/distribution';
import { EmojiPicker } from './EmojiPicker';
import { IconTrash } from './Icons';

/**
 * Everything about one player, editable — the escape hatch for the messy reality of
 * a home game: a cash-out typed wrong, a buy-in that was really two, someone who
 * left and came back for a different amount.
 *
 * The money model is cumulative and deliberately simple:
 *   bought in  = every euro that went ON the table for this player
 *   cashed out = every euro that came OFF it
 *   net        = cashed out − bought in
 * Buying back in after cashing out just adds to "bought in" and puts them back in
 * play; the earlier cash-out stays on the record.
 */
export default function PlayerSheet({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const t = useT();
  const { money } = useFmt();
  const { currency, unitValue } = state.settings;
  const player = state.ledger.find((p) => p.id === playerId);
  const [emojiOpen, setEmojiOpen] = useState(false);

  if (!player) return null;
  const patch = (p: Partial<typeof player>) => dispatch({ type: 'LEDGER_UPDATE', id: player.id, patch: p });
  const net = (player.cashOut || 0) - (player.buyIn || 0);
  const inPlay = !player.out;
  /** one-tap money onto the live stack — the buy-in first, then the usual notes */
  const quick = [state.session.buyIn, 5, 10, 20, 50].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4);
  const addChips = (euros: number) =>
    patch({ chips: (player.chips || 0) + moneyToUnits(euros, unitValue) });

  return (
    <div className="cr-sheet" role="dialog" aria-modal="true">
      <div className="cr-head">
        <div className="cr-title">{t('sheet.title')}</div>
        <button className="cr-x icon-btn" onClick={onClose} aria-label={t('count.close')}>✕</button>
      </div>

      <div className="cr-body">
        <div className="ps-name-row">
          <button type="button" className="pr-emoji" onClick={() => setEmojiOpen((v) => !v)} aria-label={t('roster.avatar')}>
            {player.emoji || '🙂'}
          </button>
          <input
            className="input"
            value={player.name}
            placeholder={t('roster.name')}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>
        {emojiOpen && (
          <EmojiPicker value={player.emoji} onPick={(emoji) => { patch({ emoji }); setEmojiOpen(false); }} />
        )}

        <div className="ps-field">
          <label>{t('sheet.boughtIn')}</label>
          <div className="input-affix">
            <span className="affix">{currency}</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="any"
              value={player.buyIn || ''}
              onChange={(e) => patch({ buyIn: Math.max(0, +e.target.value) })}
            />
          </div>
          <p className="faint ps-hint">{t('sheet.boughtInHint')}</p>
        </div>

        <div className="ps-field">
          <label>{t('sheet.cashedOut')}</label>
          <div className="input-affix">
            <span className="affix">{currency}</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="any"
              value={player.cashOut || ''}
              onChange={(e) => patch({ cashOut: Math.max(0, +e.target.value) })}
            />
          </div>
          <p className="faint ps-hint">{t('sheet.cashedOutHint')}</p>
        </div>

        <div className="ps-field">
          <label>{t('sheet.stack')}</label>
          <div className="input-affix">
            <span className="affix">{currency}</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="0"
              value={player.chips ? Math.round(player.chips * unitValue * 100) / 100 : ''}
              onChange={(e) =>
                patch({ chips: +e.target.value > 0 ? moneyToUnits(+e.target.value, unitValue) : undefined })
              }
            />
          </div>
          <div className="quick-row">
            {quick.map((n) => (
              <button key={n} type="button" className="quick-chip" onClick={() => addChips(n)}>
                +{currency}{n}
              </button>
            ))}
            <button type="button" className="quick-chip" onClick={() => patch({ chips: undefined })}>C</button>
          </div>
          <p className="faint ps-hint">{t('sheet.stackHint')}</p>
        </div>

        <div className="row ps-status">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t('sheet.inPlay')}</div>
            <div className="faint" style={{ fontSize: 12 }}>{t('sheet.inPlayHint')}</div>
          </div>
          <div className="spacer" />
          <div
            className={`toggle ${inPlay ? 'on' : ''}`}
            role="switch"
            aria-checked={inPlay}
            onClick={() => patch(inPlay ? { out: true, outAt: Date.now() } : { out: false, outAt: undefined })}
          />
        </div>

        <div className="ps-net">
          <span>{t('cash.net')}</span>
          <b className={net >= 0 ? 'pos' : 'neg'}>{net >= 0 ? '+' : ''}{money(net, currency)}</b>
        </div>

        <button
          className="btn btn-ghost btn-block btn-sm"
          onClick={() => {
            if (confirm(t('sheet.resetConfirm', { name: player.name || 'Player' })))
              dispatch({ type: 'LEDGER_RESET_PLAYER', id: player.id });
          }}
        >
          ↺ {t('roster.resetPlayer')}
        </button>

        <button
          className="btn btn-ghost btn-block btn-sm ps-delete"
          onClick={() => {
            if (confirm(t('sheet.removeConfirm', { name: player.name || 'Player' }))) {
              dispatch({ type: 'LEDGER_REMOVE', id: player.id });
              onClose();
            }
          }}
        >
          <IconTrash size={15} /> {t('roster.remove')}
        </button>
      </div>

      <div className="cr-bar">
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>{t('sheet.done')}</button>
      </div>
    </div>
  );
}
