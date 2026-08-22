import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { useStore } from '../store';
import { useT } from '../lib/i18n';
import { encodeSetup, decodeSetup, renderStackImage } from '../lib/share';
import { IconShare, IconCheck } from '../components/Icons';

interface Props {
  onClose: () => void;
  imageRows: { value: number; color: string; count: number; shape?: string }[];
  title: string;
  subtitle: string;
  totalChips: number;
  totalLabel: string;
}

export default function ShareSheet({ onClose, imageRows, title, subtitle, totalChips, totalLabel }: Props) {
  const { state, dispatch } = useStore();
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const code = useMemo(() => encodeSetup(state), [state]);

  const imageUrl = useMemo(
    () => renderStackImage({ title, subtitle, rows: imageRows, totalChips, totalLabel }),
    [title, subtitle, imageRows, totalChips, totalLabel],
  );

  const qrUrl = useMemo(() => {
    try {
      const qr = qrcode(0, 'L');
      qr.addData(code);
      qr.make();
      return qr.createDataURL(4, 12);
    } catch {
      return null;
    }
  }, [code]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const shareImage = async () => {
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], 'chipstack.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'ChipStack', text: title });
        return;
      }
    } catch {
      /* fall through to download */
    }
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = 'chipstack.png';
    a.click();
  };

  const doImport = () => {
    const decoded = decodeSetup(importText);
    if (!decoded) {
      setImportMsg(t('share.importFailed'));
      return;
    }
    dispatch({ type: 'IMPORT_SETUP', ...decoded });
    setImportMsg(t('share.imported'));
    setTimeout(onClose, 700);
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3 className="sheet-title">{t('share.title')}</h3>

        <img className="share-img" src={imageUrl} alt={t('share.imageAlt')} />
        <button className="btn btn-primary btn-block mt12" onClick={shareImage}>
          <IconShare size={17} /> {t('share.shareImage')}
        </button>

        <div className="divider" />
        <div className="section-label" style={{ margin: '0 0 8px' }}>{t('share.setupCode')}</div>
        <div className="code-box">{code}</div>
        <button className="btn btn-ghost btn-block btn-sm mt8" onClick={copyCode}>
          {copied ? (
            <>
              <IconCheck size={16} /> {t('settings.copied')}
            </>
          ) : (
            t('share.copyCode')
          )}
        </button>
        {qrUrl ? (
          <div className="qr-wrap">
            <img src={qrUrl} alt={t('share.qrAlt')} />
            <span className="faint" style={{ fontSize: 11.5 }}>{t('share.qrHint')}</span>
          </div>
        ) : (
          <p className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>
            {t('share.tooLarge')}
          </p>
        )}

        <div className="divider" />
        <div className="section-label" style={{ margin: '0 0 8px' }}>{t('share.importTitle')}</div>
        <textarea
          className="import-box"
          placeholder={t('share.importPlaceholder')}
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
            setImportMsg(null);
          }}
        />
        <button className="btn btn-ghost btn-block btn-sm mt8" onClick={doImport} disabled={!importText.trim()}>
          {t('share.import')}
        </button>
        {importMsg && (
          <p style={{ fontSize: 12.5, textAlign: 'center', marginTop: 8, color: importMsg.includes('imported') ? '#4fe08a' : '#ffb3aa', fontWeight: 700 }}>
            {importMsg}
          </p>
        )}

        <button className="btn btn-ghost btn-block mt16" onClick={onClose}>
          {t('share.close')}
        </button>
      </div>
    </div>
  );
}
