import { useT } from '../lib/i18n';

/**
 * The player-avatar emoji set + its picker grid. Lives here (not in a screen) so
 * BOTH the always-available Table roster and the host RemoteControl offer the same
 * list — before this, the picker only existed on the remote, so emojis were
 * unreachable without a live TV session.
 *
 * The set is grouped now rather than one long unlabelled wall: it is roughly three
 * times the size it was, and a flat grid of 180 glyphs is something you scroll past,
 * not something you choose from. `EMOJIS` stays exported flat for anything that just
 * wants "a valid avatar".
 */

export const EMOJI_GROUPS: { key: string; emojis: string[] }[] = [
  {
    key: 'attitude',
    emojis: [
      '😎', '🤠', '🤑', '🥸', '😈', '👿', '🤖', '👽', '🤡', '🥶', '🤯', '🫡',
      '🧊', '🤫', '🤨', '🧐', '😏', '🙃', '🥹', '😤', '🤪', '🫠', '😴', '🤕',
      '👻', '🎃', '🧛', '🧟', '🧙', '🦹', '🥷', '🕵️',
      '😇', '🤓', '😬', '🥴', '🫥', '🙄', '😑', '😮‍💨', '🤐', '🥱', '👹', '👺',
      '🧞', '🦸', '🧌',
    ],
  },
  {
    key: 'animals',
    emojis: [
      '🦈', '🐷', '🦁', '🐺', '🦊', '🐸', '🐟', '🐙', '🦖', '🐉', '🦉', '🦝',
      '🐨', '🐯', '🦄', '🦡', '🐢', '🦅', '🐜', '🦂', '🐧', '🦩', '🦜', '🐊',
      '🦥', '🦦', '🐘', '🦏', '🐋', '🦭', '🐝', '🦋', '🐌', '🦚', '🐓', '🐴',
      '🦌', '🐮', '🐭', '🐰',
      '🦧', '🦣', '🐆', '🦬', '🦫', '🐿️', '🦔', '🦇', '🪿', '🐳', '🦑', '🦞',
      '🦀', '🐡', '🦢', '🐇',
    ],
  },
  {
    key: 'poker',
    emojis: [
      '👑', '🃏', '♠️', '♥️', '♦️', '♣️', '🎲', '💰', '💵', '💸', '💎', '🏆',
      '🥇', '🥈', '🥉', '🎯', '🧲', '🪙', '💳', '📈', '📉', '⏳', '🔔', '🪄',
      '🎴', '🀄', '🧮', '💴', '💶', '💷', '🏦', '📊', '⌛', '🎟️', '🧾', '⚖️',
    ],
  },
  {
    key: 'luck',
    emojis: [
      '🍀', '🧿', '🔮', '💣', '💀', '☠️', '🔥', '⚡', '🌪️', '🧨', '✨', '🌟',
      '☄️', '🌈', '🎰', '🎱', '🪬', '🕯️',
      '🌙', '⭐', '🍄', '🌠', '🎆', '🎇', '🪆', '🧸', '🕳️', '🌀',
    ],
  },
  {
    key: 'snacks',
    emojis: [
      '🍺', '🍻', '🍷', '🥃', '🍸', '🍹', '🍾', '🥂', '☕', '🧉', '🥤', '🍕',
      '🌮', '🍔', '🍟', '🌭', '🍩', '🍪', '🥜', '🥨', '🍫', '🧀', '🍿', '🚬',
      '🍖', '🍗', '🥓', '🧇', '🥐', '🍰', '🧁', '🍦', '🥟', '🍜', '🍣', '🧃',
    ],
  },
  {
    key: 'swagger',
    emojis: [
      '🎩', '🕶️', '🧢', '👔', '🥊', '🎸', '🥁', '🎤', '🦾', '🚀', '🛸', '🏴‍☠️',
      '⚓', '🛡️', '⚔️', '🗿', '🏁', '🎪', '🎬', '🪩', '🛹', '🏎️', '🚁', '🦿',
      '👟', '🧣', '🧤', '💼', '🎷', '🎺', '🪕', '🎻', '🛵', '🚂', '⛵', '🪂',
      '🏹', '🔱',
    ],
  },
];

/** Every emoji in the picker, flat and in group order. */
export const EMOJIS = EMOJI_GROUPS.flatMap((g) => g.emojis);

/** Tapping the already-active emoji clears it (onPick gets undefined). */
export function EmojiPicker({ value, onPick }: { value?: string; onPick: (emoji: string | undefined) => void }) {
  const t = useT();
  return (
    <div className="emoji-picker">
      {EMOJI_GROUPS.map((group) => (
        <div key={group.key}>
          <div className="emoji-group-label">{t(`emoji.${group.key}`)}</div>
          <div className="emoji-grid">
            {group.emojis.map((e) => (
              <button
                key={e}
                type="button"
                className={`emoji-opt ${value === e ? 'active' : ''}`}
                onClick={() => onPick(value === e ? undefined : e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
