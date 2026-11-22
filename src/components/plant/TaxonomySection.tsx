import { useTranslation } from 'react-i18next';
import type { TaxonomyHierarchy } from '../../types/plant';

interface TaxonomySectionProps {
  taxonomy: TaxonomyHierarchy | null;
}

const TAXONOMY_RANKS: Array<{
  key: keyof Pick<
    TaxonomyHierarchy,
    'kingdom' | 'phylum' | 'class' | 'order' | 'family' | 'genus' | 'species'
  >;
  italic?: boolean;
}> = [
  { key: 'kingdom' },
  { key: 'phylum' },
  { key: 'class' },
  { key: 'order' },
  { key: 'family' },
  { key: 'genus', italic: true },
  { key: 'species', italic: true },
];

export function TaxonomySection({ taxonomy }: TaxonomySectionProps) {
  const { t } = useTranslation();
  const unavailableLabel = t('results.taxonomy.unavailable');

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[#DCE4DF] bg-white p-6 print-break-inside-avoid">
        <div className="space-y-1 border-b border-[#E8EFEA] pb-4">
          <h2 className="text-lg font-semibold text-[#111C17]">
            {t('results.taxonomy.title')}
          </h2>
          <p className="text-sm text-[#4B5D54]">{t('results.taxonomy.subtitle')}</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#4B5D54]">
          <span
            className={
              taxonomy?.verifiedByGbif ? 'font-medium text-[#166534]' : 'font-medium text-[#92400E]'
            }
          >
            {taxonomy?.verifiedByGbif
              ? t('results.taxonomy.verified')
              : t('results.taxonomy.unverified')}
          </span>
          {taxonomy?.gbifUsageKey && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Taxon ID: {taxonomy.gbifUsageKey}</span>
            </>
          )}
          {taxonomy?.taxonomicStatus && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {t('results.taxonomy.gbifStatus')}: {taxonomy.taxonomicStatus}
              </span>
            </>
          )}
        </div>

        {/* 7-Rank Taxonomic Hierarchy */}
        <ol className="mt-6 divide-y divide-[#E8EFEA] border-t border-b border-[#E8EFEA]">
          {TAXONOMY_RANKS.map((rank, index) => {
            const rawVal = taxonomy ? taxonomy[rank.key] : null;
            const value = rawVal && rawVal.trim() ? rawVal : null;
            return (
              <li
                key={rank.key}
                className="grid grid-cols-1 gap-1 py-3.5 sm:grid-cols-12 sm:items-center"
              >
                <div className="flex items-center gap-3 sm:col-span-4">
                  <span className="font-mono text-xs tabular-nums text-[#73877C]">
                    0{index + 1}
                  </span>
                  <span className="text-sm font-medium text-[#4B5D54]">
                    {t(`results.taxonomy.ranks.${rank.key}`)}
                  </span>
                </div>
                <div className="sm:col-span-8">
                  {value ? (
                    <span
                      className={`text-sm font-semibold text-[#111C17] ${
                        rank.italic ? 'italic' : ''
                      }`}
                    >
                      {value}
                    </span>
                  ) : (
                    <span className="text-sm text-[#73877C]">{unavailableLabel}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Synonyms */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-[#111C17]">
            {t('results.taxonomy.synonymsTitle')}
          </h3>
          {taxonomy && taxonomy.synonyms.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5 text-sm italic text-[#364B41]">
              {taxonomy.synonyms.map((syn) => (
                <li key={syn}>{syn}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[#73877C]">{t('results.taxonomy.noSynonyms')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
