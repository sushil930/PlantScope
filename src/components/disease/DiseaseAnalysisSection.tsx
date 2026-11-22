import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import type { DiseaseAnalysisResult } from '../../types/plant';
import { formatScorePercent, getErrorTranslationKey } from '../../lib/utils';

interface DiseaseAnalysisSectionProps {
  disease: DiseaseAnalysisResult;
}

export function DiseaseAnalysisSection({ disease }: DiseaseAnalysisSectionProps) {
  const { t } = useTranslation();

  const statusMeta = {
    not_requested: {
      icon: Info,
      toneClass: 'border-[#DCE4DF] bg-[#F8FAF9] text-[#111C17]',
      iconClass: 'text-[#4B5D54]',
    },
    possible_disease_detected: {
      icon: AlertTriangle,
      toneClass: 'border-[#E5C898] bg-[#FFFBF2] text-[#78350F]',
      iconClass: 'text-[#B45309]',
    },
    no_supported_match: {
      icon: Info,
      toneClass: 'border-[#DCE4DF] bg-white text-[#111C17]',
      iconClass: 'text-[#4B5D54]',
    },
    inconclusive: {
      icon: AlertCircle,
      toneClass: 'border-[#DCE4DF] bg-[#F8FAF9] text-[#111C17]',
      iconClass: 'text-[#64748B]',
    },
    unavailable: {
      icon: ShieldAlert,
      toneClass: 'border-[#F2C6CE] bg-[#FFF8F9] text-[#881337]',
      iconClass: 'text-[#BE123C]',
    },
  }[disease.status];

  const StatusIcon = statusMeta.icon;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[#DCE4DF] bg-white p-6 print-break-inside-avoid">
        <div className="space-y-1 border-b border-[#E8EFEA] pb-4">
          <h2 className="text-lg font-semibold text-[#111C17]">{t('results.disease.title')}</h2>
          <p className="text-sm text-[#4B5D54]">{t('results.disease.betaNotice')}</p>
        </div>

        {/* Explicit Status Card */}
        <div className={`mt-5 rounded-lg border p-4 ${statusMeta.toneClass}`}>
          <div className="flex items-start gap-3">
            <StatusIcon className={`mt-0.5 h-5 w-5 shrink-0 ${statusMeta.iconClass}`} aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">
                {t(`results.disease.states.${disease.status}.title`)}
              </h3>
              <p className="text-sm leading-relaxed opacity-90">
                {t(`results.disease.states.${disease.status}.desc`)}
              </p>
              {disease.status === 'unavailable' && disease.errorCode && (
                <p className="pt-1 text-xs font-medium">
                  {t(getErrorTranslationKey(disease.errorCode))}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Disease Candidates (when returned for possible_disease_detected or inconclusive) */}
        {disease.candidates.length > 0 && (
          <div className="mt-6 space-y-4">
            {disease.candidates.map((candidate, idx) => (
              <article
                key={`${candidate.eppoCode || candidate.name}-${idx}`}
                className="rounded-lg border border-[#DCE4DF] bg-[#F8FAF9] p-5 print-break-inside-avoid"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="text-base font-semibold text-[#111C17]">{candidate.label}</h4>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#4B5D54]">
                      <span>
                        {t('results.disease.eppoCode')}:{' '}
                        <span className="font-mono font-medium text-[#111C17]">
                          {candidate.eppoCode || t('results.overview.unavailable')}
                        </span>
                      </span>
                      {candidate.categories.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {t('results.disease.categoriesLabel')}:{' '}
                            {candidate.categories.join(', ')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-xs text-[#4B5D54]">{t('results.disease.modelScore')}</p>
                    <p className="font-mono text-xl font-semibold tabular-nums text-[#111C17]">
                      {formatScorePercent(candidate.score)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 border-t border-[#DCE4DF] pt-3">
                  <p className="text-xs font-medium text-[#4B5D54]">
                    {t('results.disease.descriptionLabel')}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[#111C17]">
                    {candidate.description || t('results.disease.noDescription')}
                  </p>
                </div>

                {/* Reference Images with Attribution & License */}
                {candidate.images.length > 0 && (
                  <div className="mt-4 border-t border-[#DCE4DF] pt-4">
                    <p className="text-xs font-medium text-[#4B5D54]">
                      {t('results.disease.referenceImages')}
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {candidate.images.map((img, imgIdx) => (
                        <figure
                          key={`${img.url}-${imgIdx}`}
                          className="overflow-hidden rounded-md border border-[#DCE4DF] bg-white"
                        >
                          <div className="aspect-[4/3] bg-[#F1F5F3]">
                            <img
                              src={img.url}
                              alt={`${candidate.label} reference ${imgIdx + 1}`}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <figcaption className="space-y-0.5 p-2 text-[11px] text-[#4B5D54]">
                            {img.author && (
                              <p className="truncate">
                                {t('results.disease.author')}: {img.author}
                              </p>
                            )}
                            {img.license && (
                              <p className="truncate font-mono">
                                {t('results.disease.license')}: {img.license}
                              </p>
                            )}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {/* Scientific Disclaimer */}
        <div className="mt-6 rounded-lg border border-[#DCE4DF] bg-[#F1F5F3] p-4">
          <p className="text-xs font-semibold text-[#111C17]">
            {t('results.disease.disclaimerTitle')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#4B5D54]">
            {t('results.disease.disclaimerBody')}
          </p>
        </div>
      </div>
    </div>
  );
}
