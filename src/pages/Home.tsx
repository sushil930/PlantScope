import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Leaf } from 'lucide-react';
import { Button } from '../components/ui/button';

const HERO_IMAGE = '/src/assets/images/hero_botanical_specimen_1795362096774.jpg';

const FEATURE_ASSETS = [
  {
    key: 'identification',
    image: '/src/assets/images/feature_plant_id_1795362096035.jpg',
    alt: 'Close-up botanical leaf venation for species identification',
  },
  {
    key: 'disease',
    image: '/src/assets/images/feature_disease_leaf_1795362096564.jpg',
    alt: 'Plant leaf specimen showing spotting for pathology screening',
  },
  {
    key: 'classification',
    image: '/src/assets/images/feature_taxonomy_flora_1795362131129.jpg',
    alt: 'Structured botanical specimens illustrating scientific taxonomy',
  },
] as const;

export function Home() {
  const { t } = useTranslation();

  return (
    <div>
      {/* Hero Section */}
      <section className="border-b border-[#DCE4DF] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-stretch">
            {/* Left Content Column */}
            <div className="flex flex-col justify-center lg:col-span-6">
              <p className="text-xs font-medium tracking-wide text-[#166534]">
                {t('home.attribution')}
              </p>
              <h1
                className="mt-4 text-4xl font-semibold tracking-tight text-[#111C17] sm:text-5xl leading-[1.12]"
                style={{ textWrap: 'balance' }}
              >
                {t('home.headline')}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-[#4B5D54] sm:text-lg">
                {t('home.subheadline')}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <Button asChild size="lg">
                  <Link to="/identify">
                    <span>{t('home.primaryCta')}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href="#how-it-works">{t('home.secondaryCta')}</a>
                </Button>
              </div>

              <div className="mt-8 space-y-1 border-t border-[#E8EFEA] pt-5 text-xs text-[#4B5D54]">
                <p>{t('home.gbifAttribution')}</p>
                <p>{t('home.privacyNote')}</p>
              </div>
            </div>

            {/* Right Botanical Photography Column */}
            <div className="lg:col-span-6">
              <figure className="flex h-full flex-col overflow-hidden rounded-lg border border-[#DCE4DF] bg-[#F1F5F3]">
                <div className="relative flex-1 min-h-[280px] sm:min-h-[340px]">
                  <img
                    src={HERO_IMAGE}
                    alt="Pressed botanical leaf and white flower specimen on herbarium paper"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover lg:absolute lg:inset-0"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="hidden h-full w-full items-center justify-center p-8 text-[#4B5D54]">
                    <Leaf className="h-12 w-12 text-[#166534]/40" aria-hidden="true" />
                  </div>
                </div>
                <figcaption className="border-t border-[#DCE4DF] bg-white px-4 py-3 text-xs text-[#4B5D54]">
                  {t('home.specimenCaption')}
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* Three Core Feature Sections */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-[#111C17] sm:text-3xl">
            {t('home.featuresTitle')}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[#4B5D54]">
            {t('home.featuresSubtitle')}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
          {FEATURE_ASSETS.map((feature) => (
            <article
              key={feature.key}
              className="flex flex-col overflow-hidden rounded-lg border border-[#DCE4DF] bg-white"
            >
              <div className="aspect-[4/3] w-full overflow-hidden border-b border-[#DCE4DF] bg-[#F1F5F3]">
                <img
                  src={feature.image}
                  alt={feature.alt}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <p className="font-mono text-xs font-medium text-[#166534]">
                  {t(`home.features.${feature.key}.index`)}.
                </p>
                <h3 className="mt-2 text-lg font-semibold text-[#111C17]">
                  {t(`home.features.${feature.key}.title`)}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-[#4B5D54]">
                  {t(`home.features.${feature.key}.description`)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section
        id="how-it-works"
        className="border-t border-[#DCE4DF] bg-white py-16 lg:py-20"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-[#111C17] sm:text-3xl">
            {t('home.howItWorks.title')}
          </h2>

          <ol className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
            {[1, 2, 3].map((step) => (
              <li
                key={step}
                className="border-t border-[#DCE4DF] pt-5"
              >
                <span className="font-mono text-xs font-semibold text-[#166534]">
                  0{step}
                </span>
                <h3 className="mt-2 text-base font-semibold text-[#111C17]">
                  {t(`home.howItWorks.step${step}Title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#4B5D54]">
                  {t(`home.howItWorks.step${step}Desc`)}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-[#E8EFEA] pt-8">
            <p className="text-sm text-[#4B5D54]">{t('home.attribution')}</p>
            <Button asChild>
              <Link to="/identify">
                <span>{t('home.primaryCta')}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
