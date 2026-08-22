/**
 * The on/off switch used across the app.
 *
 * It exists because the switches used to be `<div role="switch" onClick>`: a screen
 * reader announced them, but nothing could reach or operate them without a mouse or
 * a finger — no tab stop, no Space, no Enter. That is a real problem here, because
 * the same UI runs on a laptop acting as the big screen, where the only input is a
 * keyboard (or a TV remote sending arrow keys and Enter).
 *
 * A `<button>` gets focus, Space and Enter for free; `role="switch"` + `aria-checked`
 * keeps the announcement right.
 */
export function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: () => void;
  /** what the switch controls — announced, never drawn */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={onChange}
    />
  );
}

export default Toggle;
