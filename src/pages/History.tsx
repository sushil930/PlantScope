import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Leaf, Search, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { useScanHistory } from '../hooks/useScanHistory';
import {
  filterAndSortHistory,
  formatScorePercent,
  formatTimestamp,
} from '../lib/utils';

export function History() {
  const { t, i18n } = useTranslation();
  const { records, loading, removeRecord, clearHistory } = useScanHistory();

  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const visibleRecords = useMemo(
    () => filterAndSortHistory(records, query, sortOrder),
    [records, query, sortOrder]
  );

  const handleConfirmClear = async () => {
    await clearHistory();
    setClearDialogOpen(false);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 border-b border-[#DCE4DF] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-[#111C17] sm:text-3xl">
            {t('history.title')}
          </h1>
          <p className="text-sm leading-relaxed text-[#4B5D54]">{t('history.subtitle')}</p>
        </div>

        {records.length > 0 && (
          <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>{t('history.clearAll')}</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('history.clearConfirmTitle')}</DialogTitle>
                <DialogDescription>
                  {t('history.clearConfirmDesc', { count: records.length })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {t('history.cancel')}
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleConfirmClear()}
                >
                  {t('history.confirmClear')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Controls Bar */}
      {records.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#73877C]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('history.searchPlaceholder')}
              aria-label={t('history.searchPlaceholder')}
              className="h-10 w-full rounded-md border border-[#DCE4DF] bg-white pl-9 pr-3 text-sm text-[#111C17] placeholder:text-[#73877C] focus:border-[#166534] focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-xs tabular-nums text-[#4B5D54]">
              {t('history.recordCount', { count: visibleRecords.length })}
            </span>
            <label htmlFor="history-sort" className="sr-only">
              {t('history.sortLabel')}
            </label>
            <select
              id="history-sort"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
              className="h-10 rounded-md border border-[#DCE4DF] bg-white px-3 text-sm text-[#111C17] focus:border-[#166534] focus:outline-none focus:ring-1 focus:ring-[#166534]"
            >
              <option value="newest">{t('history.sortNewest')}</option>
              <option value="oldest">{t('history.sortOldest')}</option>
            </select>
          </div>
        </div>
      )}

      {/* List Content */}
      <div className="mt-6">
        {loading ? (
          <div className="rounded-lg border border-[#DCE4DF] bg-white p-8 text-sm text-[#4B5D54]">
            Loading...
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-lg border border-[#DCE4DF] bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-[#F1F5F3] text-[#166534]">
              <Leaf className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-[#111C17]">
              {t('history.emptyTitle')}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#4B5D54]">
              {t('history.emptyDesc')}
            </p>
            <div className="mt-6">
              <Button asChild>
                <Link to="/identify">
                  <span>{t('history.emptyCta')}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        ) : visibleRecords.length === 0 ? (
          <div className="rounded-lg border border-[#DCE4DF] bg-white p-8 text-center text-sm text-[#4B5D54]">
            {t('history.noMatches', { query })}
          </div>
        ) : (
          <ul className="divide-y divide-[#E8EFEA] overflow-hidden rounded-lg border border-[#DCE4DF] bg-white">
            {visibleRecords.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-4 min-w-0">
                  {item.thumbnailDataUrl ? (
                    <img
                      src={item.thumbnailDataUrl}
                      alt={item.commonName}
                      referrerPolicy="no-referrer"
                      className="h-14 w-14 shrink-0 rounded-md border border-[#DCE4DF] object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-[#DCE4DF] bg-[#F1F5F3] text-[#166534]">
                      <Leaf className="h-5 w-5" aria-hidden="true" />
                    </div>
                  )}

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h2 className="text-base font-semibold text-[#111C17]">
                        {item.commonName}
                      </h2>
                      <span className="text-sm italic text-[#364B41]">{item.scientificName}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#4B5D54]">
                      <span className="font-mono tabular-nums">
                        {formatTimestamp(item.timestamp, i18n.language)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono font-medium tabular-nums text-[#111C17]">
                        {formatScorePercent(item.score)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{t(`history.diseaseBadge.${item.diseaseStatus}`)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/results/${item.id}`}>{t('history.openScan')}</Link>
                  </Button>
                  <button
                    type="button"
                    aria-label={t('history.deleteScan', { name: item.commonName })}
                    onClick={() => void removeRecord(item.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#DCE4DF] text-[#4B5D54] hover:border-[#F2C6CE] hover:bg-[#FFF8F9] hover:text-[#BE123C] transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
