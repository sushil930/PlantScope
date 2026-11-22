import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bookmark, BookmarkCheck, Plus, Printer } from 'lucide-react';
import { DiseaseAnalysisSection } from '../components/disease/DiseaseAnalysisSection';
import { PlantOverviewSection } from '../components/plant/PlantOverviewSection';
import { TaxonomySection } from '../components/plant/TaxonomySection';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { getScanRecordById, saveScanRecord } from '../lib/historyDb';
import { getActiveScan } from '../lib/sessionScanStore';
import { createStoredRecordFromScan, formatTimestamp } from '../lib/utils';
import type { ScanResult } from '../types/plant';

export function Results() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();

  const [result, setResult] = useState<ScanResult | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [allowPhotoSave, setAllowPhotoSave] = useState(false);
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState(0);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [useTabbedLayout, setUseTabbedLayout] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
  );
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handleViewport = (event: MediaQueryListEvent) => setUseTabbedLayout(event.matches);
    const handleBeforePrint = () => setIsPrinting(true);
    const handleAfterPrint = () => setIsPrinting(false);

    setUseTabbedLayout(mq.matches);
    mq.addEventListener('change', handleViewport);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      mq.removeEventListener('change', handleViewport);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadScan() {
      if (!id) {
        setLoading(false);
        return;
      }

      const active = getActiveScan(id);
      const stored = await getScanRecordById(id).catch(() => null);

      if (!mounted) return;

      if (active) {
        setResult(active.result);
        setPreviewImageUrl(active.previewDataUrl);
        setAllowPhotoSave(active.savePhotoLocally);
        setSaved(Boolean(stored));
      } else if (stored) {
        setResult(stored.result);
        setPreviewImageUrl(stored.thumbnailDataUrl || null);
        setAllowPhotoSave(Boolean(stored.thumbnailDataUrl));
        setSaved(true);
      } else {
        setResult(null);
      }

      setSelectedCandidateIdx(0);
      setLoading(false);
    }

    void loadScan();
    return () => {
      mounted = false;
    };
  }, [id]);

  const handleSaveScan = async () => {
    if (!result || saving) return;
    setSaving(true);
    try {
      const record = createStoredRecordFromScan(
        result,
        allowPhotoSave ? previewImageUrl : null
      );
      await saveScanRecord(record);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 50);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-sm text-[#4B5D54]">Loading report...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-[#111C17]">{t('results.notFound.title')}</h1>
        <p className="mt-3 text-sm text-[#4B5D54]">{t('results.notFound.desc')}</p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/identify">{t('results.notFound.cta')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      {/* Report Header */}
      <div className="flex flex-col gap-5 border-b border-[#DCE4DF] pb-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-[#111C17] sm:text-3xl">
            {t('results.title')}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#4B5D54]">
            <span className="font-mono tabular-nums">
              {t('results.scannedOn', {
                date: formatTimestamp(result.timestamp, i18n.language),
              })}
            </span>
            <span aria-hidden="true">·</span>
            <span>{t('results.imagesAnalyzed', { count: result.imageCount })}</span>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 no-print">
          <Button
            type="button"
            variant={saved ? 'secondary' : 'default'}
            size="sm"
            disabled={saving}
            onClick={() => void handleSaveScan()}
          >
            {saved ? (
              <BookmarkCheck className="h-4 w-4 text-[#166534]" aria-hidden="true" />
            ) : (
              <Bookmark className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{saved ? t('results.actions.saved') : t('results.actions.saveScan')}</span>
          </Button>

          <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            <span>{t('results.actions.printReport')}</span>
          </Button>

          <Button asChild variant="outline" size="sm">
            <Link to="/identify">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{t('results.actions.newScan')}</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Desktop Tabbed Layout vs Mobile / Print Vertical Stack (single mounted DOM tree) */}
      {useTabbedLayout && !isPrinting ? (
        <div className="mt-8">
          <Tabs defaultValue="overview">
            <TabsList aria-label="Result sections">
              <TabsTrigger value="overview">{t('results.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="taxonomy">{t('results.tabs.taxonomy')}</TabsTrigger>
              <TabsTrigger value="disease">{t('results.tabs.disease')}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <PlantOverviewSection
                result={result}
                previewImageUrl={previewImageUrl}
                selectedIndex={selectedCandidateIdx}
                onSelectCandidate={setSelectedCandidateIdx}
              />
            </TabsContent>

            <TabsContent value="taxonomy">
              <TaxonomySection taxonomy={result.taxonomy} />
            </TabsContent>

            <TabsContent value="disease">
              <DiseaseAnalysisSection disease={result.disease} />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          <PlantOverviewSection
            result={result}
            previewImageUrl={previewImageUrl}
            selectedIndex={selectedCandidateIdx}
            onSelectCandidate={setSelectedCandidateIdx}
          />
          <TaxonomySection taxonomy={result.taxonomy} />
          <DiseaseAnalysisSection disease={result.disease} />
        </div>
      )}

      {/* Additional Information & Source Attribution */}
      <section className="mt-10 rounded-lg border border-[#DCE4DF] bg-white p-6 print-break-inside-avoid">
        <h2 className="text-base font-semibold text-[#111C17]">{t('results.additional.title')}</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[#4B5D54]">{t('results.additional.sourcesTitle')}</dt>
            <dd className="mt-1 space-y-1 text-xs text-[#111C17]">
              <p>{t('home.attribution')}</p>
              <p>{t('home.gbifAttribution')}</p>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#4B5D54]">{t('results.additional.plantnetVersion')}</dt>
            <dd className="mt-1 font-mono text-xs text-[#111C17]">
              {result.plantnetVersion || t('results.overview.unavailable')}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#4B5D54]">{t('results.additional.languageInfo')}</dt>
            <dd className="mt-1 font-mono text-xs text-[#111C17]">
              {result.languageRequested} / {result.languageSentToApi}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
