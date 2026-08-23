import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { useBackHandler } from '../lib/backHandler';
import { useConfirm } from './Confirm';
import { EmojiPicker } from './EmojiPicker';
import { IconPlus, IconTrash } from './Icons';

/**
 * Seat the regulars.
 *
 * A home game is the same six people most weeks, and every one of them used to be
 * retyped from scratch every night ("Player 3", rename, pick an emoji, repeat). The
 * saved list lives on this device (see `AppState.people`); tapping names and hitting
 * seat is the whole flow.
 */
export default function PeoplePicker({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const t = useT();
  const confirm = useConfirm();
  useBackHandler(true, onClose);

  const seatedIds = new Set(state.ledger.map((p) => p.personId).filter(Boolean) as string[]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [emojiId, setEmojiId] = useState<string | null>(null);

  const people = [...state.people].sort(
    (a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) || a.name.localeCompare(b.name),
  );

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const addNew = () => {
    const clean = name.trim();
    if (!clean) return;
    dispatch({ type: 'PERSON_SAVE', person: { name: clean } });
    setName('');
    // The reducer assigns the id, so the new person can't be pre-selected here.
    // They sort to the top of the list unplayed, which is close enough to obvious.
  };

  const seat = () => {
    if (picked.size) dispatch({ type: 'LEDGER_SEAT_PEOPLE', ids: [...picked] });
    onClose();
  };

  return (
    <div className="cr-sheet" role="dialog" aria-modal="true">
      <div className="cr-head">
        <div className="cr-title">{t('people.title')}</div>
        <div className="cr-prev">{t('people.hint')}</div>
        <button className="cr-x icon-btn" onClick={onClose} aria-label={t('count.close')}>✕</button>
      </div>

      <div className="cr-body">
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            value={name}
            placeholder={t('people.newPlaceholder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addNew();
            }}
          />
          <button className="btn btn-ghost btn-sm" onClick={addNew} disabled={!name.trim()}>
            <IconPlus size={15} /> {t('people.add')}
          </button>
        </div>

        {people.length === 0 ? (
          <div className="empty" style={{ marginTop: 18 }}>{t('people.none')}</div>
        ) : (
          <div className="pp-list">
            {people.map((p) => {
              const seated = seatedIds.has(p.id);
              const on = picked.has(p.id);
              return (
                <div className={`pp-row ${seated ? 'is-seated' : ''} ${on ? 'is-on' : ''}`} key={p.id}>
                  <button
                    className="pp-emoji"
                    onClick={() => setEmojiId(emojiId === p.id ? null : p.id)}
                    aria-label={t('roster.avatar')}
                  >
                    {p.emoji || '🙂'}
                  </button>
                  <button className="pp-pick" onClick={() => !seated && toggle(p.id)} disabled={seated}>
                    <span className="pp-name">{p.name}</span>
                    {seated ? <span className="pp-tag">{t('people.seated')}</span> : on ? <span className="pp-check">✓</span> : null}
                  </button>
                  <button className="icon-btn pr-more" onClick={() => setEditId(editId === p.id ? null : p.id)} aria-label={t('people.edit')}>
                    ⋯
                  </button>

                  {emojiId === p.id && (
                    <EmojiPicker
                      value={p.emoji}
                      onPick={(emoji) => {
                        dispatch({ type: 'PERSON_SAVE', person: { id: p.id, name: p.name, emoji } });
                        setEmojiId(null);
                      }}
                    />
                  )}

                  {editId === p.id && (
                    <div className="pp-edit">
                      <div className="field">
                        <label>{t('roster.name')}</label>
                        <input
                          className="input"
                          value={p.name}
                          onChange={(e) => dispatch({ type: 'PERSON_SAVE', person: { id: p.id, name: e.target.value } })}
                        />
                      </div>
                      <div className="field">
                        <label>{t('people.payment')}</label>
                        <input
                          className="input"
                          value={p.payment ?? ''}
                          placeholder="paypal.me/…"
                          onChange={(e) => dispatch({ type: 'PERSON_SAVE', person: { id: p.id, name: p.name, payment: e.target.value } })}
                        />
                        <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>{t('people.paymentHint')}</div>
                      </div>
                      <div className="row" style={{ gap: 8, marginTop: 10 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            confirm.ask({
                              text: t('people.removeConfirm', { name: p.name }),
                              confirmLabel: t('common.remove'),
                              danger: true,
                              onYes: () => {
                                dispatch({ type: 'PERSON_REMOVE', id: p.id });
                                setEditId(null);
                              },
                            })
                          }
                        >
                          <IconTrash size={14} /> {t('common.remove')}
                        </button>
                        <div className="spacer" />
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>{t('people.done')}</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="cr-foot">
        <button className="btn btn-primary btn-block" onClick={seat} disabled={picked.size === 0}>
          {picked.size ? t('people.seat', { n: picked.size }) : t('people.seatNone')}
        </button>
      </div>
      {confirm.node}
    </div>
  );
}
