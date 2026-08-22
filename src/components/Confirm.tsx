import { useState } from 'react';
import { useT } from '../lib/i18n';

/**
 * In-app confirmation for the destructive buttons (reset the table, new night,
 * clear the league…).
 *
 * `window.confirm` was doing this job and doing it badly: it is unstyled, ignores
 * the skin, blocks the whole JS thread (so the live-sync queue and the clock stop
 * while it is open), and inside the Android WebView it renders as a system dialog
 * titled with the page URL. This is a normal element that looks like the rest of
 * the app and traps nothing.
 */
export interface ConfirmRequest {
  text: string;
  /** label of the confirming button; defaults to a plain OK */
  confirmLabel?: string;
  /** paint the confirming button as destructive */
  danger?: boolean;
  onYes: () => void;
}

export function useConfirm(): { ask: (req: ConfirmRequest) => void; node: React.ReactNode } {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  return {
    ask: setReq,
    node: req ? <ConfirmDialog req={req} onClose={() => setReq(null)} /> : null,
  };
}

function ConfirmDialog({ req, onClose }: { req: ConfirmRequest; onClose: () => void }) {
  const t = useT();
  return (
    <div
      className="confirm-scrim"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-text">{req.text}</p>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className={`btn ${req.danger ? 'btn-danger' : 'btn-primary'}`}
            autoFocus
            onClick={() => {
              req.onYes();
              onClose();
            }}
          >
            {req.confirmLabel ?? t('common.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
