import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { fetchHealth } from '../services/api';
import type { HealthResponse } from '../types/plant';

export function About() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    void fetchHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const limitations = t('about.limitations', { returnObjects: true }) as string[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <div className="border-b border-[#DCE4DF] pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[#111C17] sm:text-3xl">
          {t('about.title')}
        </h1>
        <p className="mt-2 text-base leading-relaxed text-[#4B5D54]">{t('about.subtitle')}</p>
      </div>

      {/* External APIs */}
      <section className="mt-8 space-y-5">
        <h2 className="text-lg font-semibold text-[#111C17]">{t('about.apisTitle')}</h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-lg border border-[#DCE4DF] bg-white p-6">
            <h3 className="text-base font-semibold text-[#111C17]">{t('about.plantnetTitle')}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#4B5D54]">
              {t('about.plantnetDesc')}
            </p>
          </div>

          <div className="rounded-lg border border-[#DCE4DF] bg-white p-6">
            <h3 className="text-base font-semibold text-[#111C17]">{t('about.gbifTitle')}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#4B5D54]">{t('about.gbifDesc')}</p>
          </div>
        </div>
      </section>

      {/* Scientific Limitations */}
      <section className="mt-10 rounded-lg border border-[#DCE4DF] bg-white p-6">
        <h2 className="text-lg font-semibold text-[#111C17]">{t('about.limitationsTitle')}</h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[#4B5D54]">
          {Array.isArray(limitations) &&
            limitations.map((item, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="font-mono text-xs font-semibold text-[#166534] pt-0.5">
                  0{idx + 1}.
                </span>
                <span>{item}</span>
              </li>
            ))}
        </ul>
      </section>

      {/* Privacy & Server Config Status */}
      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
        <section className="rounded-lg border border-[#DCE4DF] bg-white p-6">
          <h2 className="text-base font-semibold text-[#111C17]">{t('about.privacyTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#4B5D54]">{t('about.privacyDesc')}</p>
        </section>

        <section className="rounded-lg border border-[#DCE4DF] bg-white p-6">
          <h2 className="text-base font-semibold text-[#111C17]">{t('about.setupTitle')}</h2>
          <div className="mt-3 flex items-center gap-2.5 text-sm">
            {health?.plantnetConfigured ? (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#166534]" aria-hidden="true" />
                <span className="font-medium text-[#166534]">{t('about.configured')}</span>
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4 shrink-0 text-[#92400E]" aria-hidden="true" />
                <span className="font-medium text-[#92400E]">{t('about.notConfigured')}</span>
              </>
            )}
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-[#4B5D54]">{t('about.setupHint')}</p>
        </section>
      </div>
    </div>
  );
}
