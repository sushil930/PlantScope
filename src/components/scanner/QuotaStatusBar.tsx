import { useTranslation } from 'react-i18next';
import { AlertCircle, KeyRound, RefreshCw } from 'lucide-react';
import type { QuotaInfo } from '../../types/plant';
import { formatTimestamp } from '../../lib/utils';

interface QuotaStatusBarProps {
  quota: QuotaInfo | null;
  loading: boolean;
  requestedCalls: number;
  onRefresh: () => void;
}

export function QuotaStatusBar({
  quota,
  loading,
  requestedCalls,
  onRefresh,
}: QuotaStatusBarProps) {
  const { t, i18n } = useTranslation();

  if (loading && !quota) {
    return (
      <div className="rounded-lg border border-[#DCE4DF] bg-white px-4 py-3 text-sm text-[#4B5D54]">
        {t('scanner.quota.title')}...
      </div>
    );
  }

  if (quota && !quota.configured) {
    return (
      <div
        role="status"
        className="rounded-lg border border-[#D9C7A3] bg-[#FFFDF7] p-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#92400E]" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#78350F]">
                {t('scanner.quota.unconfiguredTitle')}
              </p>
              <p className="text-sm leading-relaxed text-[#78350F]/90">
                {t('scanner.quota.unconfiguredDesc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            aria-label={t('scanner.quota.refresh')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#E6D8BC] bg-white text-[#78350F] hover:bg-[#FAF5EA] cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    );
  }

  if (quota?.exhausted) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-[#F2C6CE] bg-[#FFF8F9] p-4"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#BE123C]" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#9F1239]">
              {t('scanner.quota.exhaustedTitle')}
            </p>
            <p className="text-sm leading-relaxed text-[#881337]">
              {t('scanner.quota.exhaustedDesc')}
            </p>
            {quota.resetAt && (
              <p className="font-mono text-xs tabular-nums text-[#9F1239]">
                {t('scanner.quota.resetAt', {
                  time: formatTimestamp(quota.resetAt, i18n.language),
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#DCE4DF] bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium text-[#111C17]">{t('scanner.quota.title')}</span>
        <span aria-hidden="true" className="text-[#9EB0A6]">
          ·
        </span>
        {quota && quota.remaining !== null && quota.dailyLimit !== null ? (
          <span className="font-mono text-xs font-medium tabular-nums text-[#166534]">
            {t('scanner.quota.remaining', {
              remaining: quota.remaining,
              limit: quota.dailyLimit,
            })}
          </span>
        ) : quota && quota.remaining !== null ? (
          <span className="font-mono text-xs font-medium tabular-nums text-[#166534]">
            {t('scanner.quota.remainingOnly', { remaining: quota.remaining })}
          </span>
        ) : (
          <span className="text-xs text-[#4B5D54]">{t('scanner.quota.unavailable')}</span>
        )}
        <span aria-hidden="true" className="text-[#9EB0A6]">
          ·
        </span>
        <span className="font-mono text-xs tabular-nums text-[#4B5D54]">
          {t('scanner.quota.costNote', { count: requestedCalls })}
        </span>
      </div>

      <button
        type="button"
        onClick={onRefresh}
        aria-label={t('scanner.quota.refresh')}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#4B5D54] hover:bg-[#F1F5F3] hover:text-[#111C17] cursor-pointer"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
