import { useEffect, useState } from 'react';
import { parseMoney } from '../lib/money';

/**
 * A money field you can actually type into on a German keyboard.
 *
 * `<input type="number">` is the obvious choice for an amount and the wrong one
 * here: the decimal key on a German phone keyboard is a COMMA, and Chrome answers a
 * comma by handing the app an EMPTY string — the amount silently becomes 0 with
 * nothing on screen to explain it. So this is a text field with a decimal keypad
 * (`inputMode="decimal"`) and `parseMoney` normalises what was typed.
 *
 * The raw text is kept locally so a half-typed "12," survives; the parsed value is
 * reported on every keystroke, so callers that write straight into the store keep
 * working. The text is only re-synced when the value arrives from SOMEWHERE ELSE —
 * a quick-amount button, a reset — which is detected by the value disagreeing with
 * what is currently typed, rather than by tracking focus (a focus flag misses the
 * cases where the field is written to while it happens not to be focused).
 */
export default function MoneyInput({
  value,
  onCommit,
  placeholder,
  className = 'input',
  autoFocus,
  onEnter,
  ariaLabel,
}: {
  value: number;
  onCommit: (amount: number) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value ? String(value) : '');

  useEffect(() => {
    // our own keystroke echoing back through the store — leave the text alone
    if (parseMoney(text) === value) return;
    setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => setText(value ? String(value) : '')}
      onChange={(e) => {
        setText(e.target.value);
        onCommit(parseMoney(e.target.value));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter?.();
      }}
    />
  );
}
