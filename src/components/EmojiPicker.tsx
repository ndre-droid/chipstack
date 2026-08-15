/**
 * The player-avatar emoji set + its picker grid. Lives here (not in a screen) so
 * BOTH the always-available Table roster and the host RemoteControl offer the same
 * list — before this, the picker only existed on the remote, so emojis were
 * unreachable without a live TV session.
 */
// grouped: attitude · animals · poker & luck · drinks & snacks · swagger
export const EMOJIS = [
  '😎', '🤠', '🤑', '🥸', '😈', '🤖', '👽', '🤡', '🥶', '🤯', '🫡', '🧊',
  '🦈', '🐷', '🦁', '🐺', '🦊', '🐸', '🐟', '🐙', '🦖', '🐉', '🦉', '🦝',
  '🐨', '🐯', '🦄', '🦡', '🐢', '🦅', '🐜', '🦂',
  '👑', '🃏', '♠️', '♥️', '♦️', '♣️', '🎲', '💰', '💎', '🏆', '🎯', '🧲',
  '🍀', '🧿', '🔮', '💣', '💀', '☠️', '🔥', '⚡', '🌪️', '🧨',
  '🍺', '🍷', '🥃', '🍸', '☕', '🍕', '🌮', '🍩', '🥜', '🚬',
  '🎩', '🕶️', '🧢', '🚀', '🛸', '🏴‍☠️', '⚓', '🥊', '🎸', '🦾',
];

/** Tapping the already-active emoji clears it (onPick gets undefined). */
export function EmojiPicker({ value, onPick }: { value?: string; onPick: (emoji: string | undefined) => void }) {
  return (
    <div className="emoji-grid">
      {EMOJIS.map((e) => (
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
  );
}
