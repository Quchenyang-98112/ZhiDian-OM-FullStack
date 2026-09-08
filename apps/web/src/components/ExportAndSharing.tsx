import { AlertTriangle, Check, Copy, FileDown, QrCode, Share2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createSharedDashboard, generateShareLink, shareViaWebShare } from '../lib/sharing';

export function ExportAndSharing() {
  const { t } = useTranslation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleDownloadPdf = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      // Dynamic import — jsPDF (~280 KB) only loads when user clicks "Download PDF"
      const { generateMonthlyStats, downloadPdfReport } = await import('../lib/pdf-report');
      const now = new Date();
      const stats = await generateMonthlyStats(now.getFullYear(), now.getMonth());
      await downloadPdfReport(stats);
      setSuccessMessage(t('common.success'));
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('PDF generation error:', error);
      setErrorMessage(t('export.pdfError'));
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateShareLink = async () => {
    setErrorMessage(null);
    try {
      const dashboard = await createSharedDashboard(
        t('export.defaultDashboardName', 'My HEMS Dashboard'),
        'shared@nexus-hems.local',
      );

      const link = generateShareLink(dashboard.id, dashboard.shareToken);

      // Try Web Share API first (mobile-friendly)
      const shared = await shareViaWebShare(
        t('export.defaultDashboardName', 'My HEMS Dashboard'),
        link,
      );
      if (shared) {
        setSuccessMessage(t('common.success'));
        setTimeout(() => setSuccessMessage(null), 3000);
        return;
      }

      // Fallback: show link + QR code
      setShareLink(link);

      // Dynamic import — qrcode (~33 KB) only loads when share link is generated
      const QRCodeLib = (await import('qrcode')).default;
      const qrUrl = await QRCodeLib.toDataURL(link, {
        width: 200,
        margin: 2,
        color: {
          dark: '#22ff88',
          light: '#0f172a',
        },
      });
      setQrCodeUrl(qrUrl);
    } catch (error) {
      console.error('Share link generation error:', error);
      setErrorMessage(t('export.linkError'));
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const handleCopyLink = async () => {
    if (shareLink) {
      try {
        await navigator.clipboard.writeText(shareLink);
        setCopied(true);
        setSuccessMessage(t('common.copySuccess', 'Copied to clipboard'));
        setTimeout(() => {
          setCopied(false);
          setSuccessMessage(null);
        }, 2000);
      } catch {
        setErrorMessage(t('export.clipboardError', 'Could not copy to clipboard'));
        setTimeout(() => setErrorMessage(null), 5000);
      }
    }
  };

  return (
    <div className="glass-panel p-6">
      <h3 className="fluid-text-lg mb-6 font-semibold text-(--color-text)">{t('export.title')}</h3>

      {/* Status Messages */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {errorMessage}
          </motion.div>
        )}
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-400 text-sm"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            {successMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {/* PDF Export */}
        <div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGenerating}
            data-export-report
            className="btn-primary focus-ring flex w-full items-center justify-center gap-2"
          >
            <FileDown className="h-5 w-5" aria-hidden="true" />
            {isGenerating ? t('export.generating') : t('export.downloadPdf')}
          </button>
          <p className="mt-2 text-(--color-muted) text-xs">{t('export.pdfDescription')}</p>
        </div>

        {/* Divider */}
        <div className="border-(--color-border) border-t" />

        {/* Share Link */}
        <div>
          <button
            type="button"
            onClick={handleGenerateShareLink}
            className="btn-secondary focus-ring flex w-full items-center justify-center gap-2"
          >
            <Share2 className="h-5 w-5" aria-hidden="true" />
            {t('export.generateShareLink')}
          </button>
          <p className="mt-2 text-(--color-muted) text-xs">{t('export.shareLinkDescription')}</p>

          {shareLink && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 overflow-hidden"
            >
              <div className="rounded-2xl border border-(--color-primary)/30 bg-(--color-primary)/5 p-4">
                {/* Link */}
                <div className="mb-4 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareLink}
                    aria-label={t('export.shareInputLabel', 'Shareable link URL')}
                    className="flex-1 rounded-lg bg-(--color-surface) px-3 py-2 text-(--color-text) text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-surface-strong) text-(--color-primary) hover:bg-(--color-surface-strong)"
                    aria-label={t('export.copyLink')}
                  >
                    {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                  </button>
                </div>

                {/* QR Code */}
                {qrCodeUrl && (
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 text-(--color-muted) text-sm">
                      <QrCode className="h-4 w-4" />
                      {t('export.qrCode')}
                    </div>
                    <img
                      src={qrCodeUrl}
                      alt={t('export.qrCodeAlt', 'QR code for shareable dashboard link')}
                      className="mt-3 rounded-lg border-(--color-primary) border-2"
                    />
                    <a
                      href={qrCodeUrl}
                      download="nexus-hems-qr.png"
                      className="btn-secondary focus-ring mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs"
                    >
                      <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('export.downloadQr', 'Download QR code')}
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
