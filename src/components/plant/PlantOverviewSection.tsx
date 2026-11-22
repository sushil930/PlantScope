import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Copy, Leaf } from 'lucide-react';
import type { PlantCandidate, ScanResult } from '../../types/plant';
import { formatScorePercent } from '../../lib/utils';
import { Button } from '../ui/button';

interface PlantOverviewSectionProps {
  result: ScanResult;
  previewImageUrl: string | null;
  selectedIndex: number;
  onSelectCandidate: (index: number) => void;
}

export function PlantOverviewSection({
  result,
  previewImageUrl,
  selectedIndex,
  onSelectCandidate,
}: PlantOverviewSectionProps) {
  const { t, i18n } = useTranslation();
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [copied, setCopied] = useState(false);

  const candidates = result.candidates;
  const activeCandidate: PlantCandidate | null = candidates[selectedIndex] ?? candidates[0] ?? null;
  const topThree = candidates.slice(0, 3);
  const additional = candidates.slice(3);

  const handleCopyScientific = async () => {
    if (!activeCandidate) return;
    try {
      await navigator.clipboard.writeText(activeCandidate.scientificNameWithoutAuthor);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy via temporary input if clipboard API is restricted
      const input = document.createElement('input');
      input.value = activeCandidate.scientificNameWithoutAuthor;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!activeCandidate) {
    return (
      <div className="rounded-lg border border-[#DCE4DF] bg-white p-8 text-center">
        <p className="text-base font-semibold text-[#111C17]">
          {t('results.overview.noCandidatesTitle')}
        </p>
        <p className="mt-2 text-sm text-[#4B5D54]">{t('results.overview.noCandidatesDesc')}</p>
      </div>
    );
  }

  const primaryCommonName =
    activeCandidate.commonNames[0] || activeCandidate.scientificNameWithoutAuthor;
  const scorePercent = formatScorePercent(activeCandidate.score);
  const confidenceTone =
    activeCandidate.confidenceLevel === 'high'
      ? 'text-[#166534]'
      : activeCandidate.confidenceLevel === 'moderate'
        ? 'text-[#92400E]'
        : 'text-[#BE123C]';

  const showHindiFallbackBanner =
    i18n.language.startsWith('hi') && result.warnings.includes('hindi_api_fallback');

  return (
    <div className="space-y-8">
      {/* Low confidence warning banner */}
      {result.lowConfidenceWarning && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-[#E5C898] bg-[#FFFBF2] p-4"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#78350F]">
              {t('results.overview.lowConfidenceBannerTitle')}
            </p>
            <p className="text-sm leading-relaxed text-[#78350F]/90">
              {t('results.overview.lowConfidenceBannerDesc')}
            </p>
          </div>
        </div>
      )}

      {showHindiFallbackBanner && (
        <p className="rounded-md border border-[#DCE4DF] bg-[#F1F5F3] px-4 py-2.5 text-xs text-[#4B5D54]">
          {t('results.overview.hindiFallbackNote')}
        </p>
      )}

      {/* Primary Specimen Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        {/* Specimen Photo */}
        <div className="lg:col-span-5">
          <div className="h-full min-h-[260px] overflow-hidden rounded-lg border border-[#DCE4DF] bg-[#F1F5F3]">
            {previewImageUrl ? (
              <img
                src={previewImageUrl}
                alt={primaryCommonName}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 p-6 text-center text-[#4B5D54]">
                <Leaf className="h-10 w-10 text-[#166534]/50" aria-hidden="true" />
                <span className="text-xs font-medium italic">
                  {activeCandidate.scientificNameWithoutAuthor}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Scientific Summary Panel */}
        <div className="flex flex-col justify-between rounded-lg border border-[#DCE4DF] bg-white p-6 lg:col-span-7">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4B5D54]">
              <span>
                {selectedIndex === 0
                  ? t('results.overview.primaryMatch')
                  : t('results.overview.selectedCandidateNote', { rank: selectedIndex + 1 })}
              </span>
              <span className={`font-medium ${confidenceTone}`}>
                {t(`results.overview.confidence.${activeCandidate.confidenceLevel}`)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#111C17] sm:text-3xl">
                  {primaryCommonName}
                </h2>
                <p
                  className="mt-1 text-lg italic text-[#364B41]"
                  data-testid="scientific-name-display"
                >
                  {activeCandidate.scientificName}
                </p>
              </div>

              <div className="text-left sm:text-right">
                <p className="text-xs text-[#4B5D54]">{t('results.overview.matchScore')}</p>
                <p className="font-mono text-3xl font-semibold tabular-nums text-[#111C17]">
                  {scorePercent}
                </p>
              </div>
            </div>

            {/* Score bar */}
            <div
              className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#E8EFEA]"
              aria-hidden="true"
            >
              <div
                className={`h-full transition-all duration-300 ${
                  activeCandidate.confidenceLevel === 'high'
                    ? 'bg-[#166534]'
                    : activeCandidate.confidenceLevel === 'moderate'
                      ? 'bg-[#B45309]'
                      : 'bg-[#BE123C]'
                }`}
                style={{ width: `${Math.max(2, Math.round(activeCandidate.score * 100))}%` }}
              />
            </div>

            {/* Structured Botanical Attributes */}
            <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-[#E8EFEA] pt-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[#4B5D54]">{t('results.overview.family')}</dt>
                <dd className="mt-1 text-sm font-medium text-[#111C17]">
                  {activeCandidate.family || t('results.overview.unavailable')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#4B5D54]">{t('results.overview.genus')}</dt>
                <dd className="mt-1 text-sm font-medium italic text-[#111C17]">
                  {activeCandidate.genus || t('results.overview.unavailable')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#4B5D54]">{t('results.overview.gbifId')}</dt>
                <dd className="mt-1 font-mono text-sm tabular-nums text-[#111C17]">
                  {activeCandidate.gbifId || t('results.overview.unavailable')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#4B5D54]">{t('results.overview.commonNames')}</dt>
                <dd className="mt-1 text-sm text-[#111C17]">
                  {activeCandidate.commonNames.length > 0
                    ? activeCandidate.commonNames.slice(0, 5).join(', ')
                    : t('results.overview.unavailable')}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#E8EFEA] pt-4 no-print">
            <Button type="button" variant="outline" size="sm" onClick={handleCopyScientific}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[#166534]" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {copied
                  ? t('results.actions.copied')
                  : t('results.actions.copyScientific')}
              </span>
            </Button>

            {activeCandidate.iucnCategory && (
              <span className="font-mono text-xs text-[#4B5D54]">
                {t('results.overview.iucnCategory')}: {activeCandidate.iucnCategory}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Top 3 Species Predictions Table */}
      <section className="rounded-lg border border-[#DCE4DF] bg-white print-break-inside-avoid">
        <div className="border-b border-[#DCE4DF] px-6 py-4">
          <h3 className="text-base font-semibold text-[#111C17]">
            {t('results.overview.topPredictions')}
          </h3>
        </div>
        <div className="divide-y divide-[#E8EFEA]">
          {topThree.map((candidate, index) => (
            <CandidateRow
              key={`${candidate.scientificName}-${index}`}
              candidate={candidate}
              rank={index + 1}
              isSelected={selectedIndex === index}
              onSelect={() => onSelectCandidate(index)}
            />
          ))}
        </div>

        {/* Expandable Additional Candidates */}
        {additional.length > 0 && (
          <div className="border-t border-[#DCE4DF]">
            <button
              type="button"
              aria-expanded={showAllCandidates}
              onClick={() => setShowAllCandidates((prev) => !prev)}
              className="flex w-full items-center justify-between px-6 py-3.5 text-sm font-medium text-[#166534] hover:bg-[#F8FAF9] transition-colors cursor-pointer no-print"
            >
              <span>
                {showAllCandidates
                  ? t('results.overview.hideMoreCandidates')
                  : t('results.overview.showMoreCandidates', { count: additional.length })}
              </span>
              {showAllCandidates ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            {showAllCandidates && (
              <div className="divide-y divide-[#E8EFEA] border-t border-[#E8EFEA]">
                {additional.map((candidate, offset) => {
                  const index = offset + 3;
                  return (
                    <CandidateRow
                      key={`${candidate.scientificName}-${index}`}
                      candidate={candidate}
                      rank={index + 1}
                      isSelected={selectedIndex === index}
                      onSelect={() => onSelectCandidate(index)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function CandidateRow({
  candidate,
  rank,
  isSelected,
  onSelect,
}: {
  candidate: PlantCandidate;
  rank: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const common = candidate.commonNames[0] || candidate.scientificNameWithoutAuthor;

  return (
    <div
      className={`flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between ${
        isSelected ? 'bg-[#F3F8F5]' : 'bg-white'
      }`}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-xs font-medium text-[#4B5D54]">0{rank}.</span>
          <span className="text-sm font-semibold text-[#111C17]">{common}</span>
          <span className="text-sm italic text-[#364B41]">
            {candidate.scientificNameWithoutAuthor}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#4B5D54]">
          <span>
            {t('results.overview.family')}: {candidate.family || t('results.overview.unavailable')}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t('results.overview.genus')}:{' '}
            <span className="italic">
              {candidate.genus || t('results.overview.unavailable')}
            </span>
          </span>
          {candidate.gbifId && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">ID {candidate.gbifId}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end shrink-0">
        <span className="font-mono text-sm font-semibold tabular-nums text-[#111C17]">
          {formatScorePercent(candidate.score)}
        </span>
        <Button
          type="button"
          variant={isSelected ? 'secondary' : 'outline'}
          size="sm"
          onClick={onSelect}
          className="no-print"
        >
          {t('results.overview.selectCandidate')}
        </Button>
      </div>
    </div>
  );
}
