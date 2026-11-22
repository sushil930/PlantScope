import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2, Microscope } from 'lucide-react';
import {
  ImageUploadZone,
  type SelectedPlantImage,
} from '../components/scanner/ImageUploadZone';
import { QuotaStatusBar } from '../components/scanner/QuotaStatusBar';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { useQuota } from '../hooks/useQuota';
import {
  getSaveLocalPhotoPreference,
  setSaveLocalPhotoPreference,
} from '../lib/historyDb';
import { setActiveScan } from '../lib/sessionScanStore';
import {
  generateLocalThumbnail,
  getErrorTranslationKey,
  validateClientImageFiles,
} from '../lib/utils';
import { ClientApiError, submitPlantScan } from '../services/api';
import type { OrganType } from '../types/plant';

export function Scanner() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { quota, loading: quotaLoading, refresh: refreshQuota, updateRemainingLocally, markExhaustedLocally } =
    useQuota();

  const [images, setImages] = useState<SelectedPlantImage[]>([]);
  const [includeDisease, setIncludeDisease] = useState(false);
  const [savePhotoLocally, setSavePhotoLocally] = useState(false);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [apiError, setApiError] = useState<{ code?: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  useEffect(() => {
    void getSaveLocalPhotoPreference().then((pref) => setSavePhotoLocally(pref));
  }, []);

  // Revoke object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestedCalls = includeDisease ? 2 : 1;
  const isQuotaExhausted = Boolean(quota?.exhausted);

  const handleAddFiles = (incoming: File[]) => {
    setApiError(null);
    const { validFiles, errors } = validateClientImageFiles(incoming, images.length);

    if (errors.length > 0) {
      const translated = errors.map((err) =>
        t(`scanner.validation.${err.key}`, { name: err.fileName || '' })
      );
      setValidationMessages(translated);
    } else {
      setValidationMessages([]);
    }

    if (validFiles.length > 0) {
      const nextItems: SelectedPlantImage[] = validFiles.map((file) => ({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        organ: 'auto',
      }));
      setImages((prev) => [...prev, ...nextItems]);
    }
  };

  const handleRemoveImage = (id: string) => {
    setValidationMessages([]);
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  };

  const handleOrganChange = (id: string, organ: OrganType) => {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, organ } : img)));
  };

  const handleClearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setValidationMessages([]);
    setApiError(null);
  };

  const handleToggleLocalPhoto = (checked: boolean) => {
    setSavePhotoLocally(checked);
    void setSaveLocalPhotoPreference(checked);
  };

  const handleSubmit = async () => {
    setValidationMessages([]);
    setApiError(null);

    if (images.length === 0) {
      setValidationMessages([t('scanner.validation.noImages')]);
      return;
    }

    if (isQuotaExhausted) {
      setApiError({
        code: 'QUOTA_EXHAUSTED',
        message: t('errors.QUOTA_EXHAUSTED'),
      });
      return;
    }

    setSubmitting(true);
    setUploadPercent(0);

    try {
      const uiLang = i18n.language.startsWith('hi') ? 'hi' : 'en';
      const scanResult = await submitPlantScan({
        items: images.map((img) => ({ file: img.file, organ: img.organ })),
        lang: uiLang,
        includeDisease,
        onUploadProgress: (pct) => setUploadPercent(pct),
      });

      if (scanResult.quotaRemaining !== null) {
        updateRemainingLocally(scanResult.quotaRemaining);
      }

      // Create an in-session data URL preview for the report view (only saved to IndexedDB if user opted in)
      const previewDataUrl = await generateLocalThumbnail(images[0].file, 640);
      setActiveScan({
        result: scanResult,
        previewDataUrl,
        savePhotoLocally,
      });

      navigate(`/results/${scanResult.id}`);
    } catch (err) {
      if (err instanceof ClientApiError) {
        if (err.code === 'QUOTA_EXHAUSTED') {
          markExhaustedLocally(err.resetAt);
        }
        setApiError({
          code: err.code,
          message: t(getErrorTranslationKey(err.code)),
        });
      } else {
        setApiError({
          code: 'UNKNOWN_ERROR',
          message: t('errors.UNKNOWN_ERROR'),
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      {/* Header */}
      <div className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[#111C17] sm:text-3xl">
          {t('scanner.title')}
        </h1>
        <p className="text-sm leading-relaxed text-[#4B5D54] sm:text-base">
          {t('scanner.subtitle')}
        </p>
      </div>

      {/* Quota Indicator */}
      <div className="mt-6">
        <QuotaStatusBar
          quota={quota}
          loading={quotaLoading}
          requestedCalls={requestedCalls}
          onRefresh={refreshQuota}
        />
      </div>

      {/* Validation & API Errors */}
      {validationMessages.length > 0 && (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-[#E5C898] bg-[#FFFBF2] p-4 text-sm text-[#78350F]"
        >
          <ul className="space-y-1">
            {validationMessages.map((msg, idx) => (
              <li key={idx}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {apiError && (
        <div
          role="alert"
          data-testid="scan-error-banner"
          className="mt-5 flex items-start gap-3 rounded-lg border border-[#F2C6CE] bg-[#FFF8F9] p-4"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#BE123C]" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-[#881337]">{apiError.message}</p>
            {apiError.code && (
              <p className="font-mono text-xs text-[#9F1239]">Code: {apiError.code}</p>
            )}
          </div>
        </div>
      )}

      {/* Main Upload Focus */}
      <div className="mt-6">
        <ImageUploadZone
          images={images}
          disabled={submitting || isQuotaExhausted}
          onAddFiles={handleAddFiles}
          onRemoveImage={handleRemoveImage}
          onOrganChange={handleOrganChange}
          onClearAll={handleClearAll}
        />
      </div>

      {/* Analysis Options & Action Bar */}
      <div className="mt-8 rounded-lg border border-[#DCE4DF] bg-white p-6">
        <h2 className="text-sm font-semibold text-[#111C17]">{t('scanner.optionsTitle')}</h2>

        <div className="mt-4 space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="include-disease"
              checked={includeDisease}
              disabled={submitting || isQuotaExhausted}
              onCheckedChange={(checked) => setIncludeDisease(checked === true)}
            />
            <div className="space-y-0.5">
              <label
                htmlFor="include-disease"
                className="block text-sm font-medium text-[#111C17] cursor-pointer"
              >
                {t('scanner.diseaseToggleLabel')}
              </label>
              <p className="text-xs leading-relaxed text-[#4B5D54]">
                {t('scanner.diseaseToggleNote')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 border-t border-[#E8EFEA] pt-4">
            <Checkbox
              id="save-local-photo"
              checked={savePhotoLocally}
              disabled={submitting}
              onCheckedChange={(checked) => handleToggleLocalPhoto(checked === true)}
            />
            <div className="space-y-0.5">
              <label
                htmlFor="save-local-photo"
                className="block text-sm font-medium text-[#111C17] cursor-pointer"
              >
                {t('scanner.savePhotoLocalLabel')}
              </label>
              <p className="text-xs leading-relaxed text-[#4B5D54]">
                {t('scanner.savePhotoLocalNote')}
              </p>
            </div>
          </div>
        </div>

        {/* Upload Progress Indicator */}
        {submitting && (
          <div className="mt-6 space-y-2 border-t border-[#E8EFEA] pt-5" aria-live="polite">
            <div className="flex items-center justify-between text-xs text-[#4B5D54]">
              <span>
                {uploadPercent < 100
                  ? t('scanner.uploadProgress', { percent: uploadPercent })
                  : t('scanner.processingStage')}
              </span>
              <span className="font-mono tabular-nums">{uploadPercent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E8EFEA]">
              <div
                className="h-full bg-[#166534] transition-all duration-150"
                style={{ width: `${Math.max(8, uploadPercent)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#E8EFEA] pt-5">
          <p className="text-xs text-[#4B5D54]">{t('home.attribution')}</p>
          <Button
            type="button"
            size="lg"
            disabled={submitting || images.length === 0 || isQuotaExhausted}
            onClick={() => void handleSubmit()}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>{t('scanner.analyzingButton')}</span>
              </>
            ) : (
              <>
                <Microscope className="h-4 w-4" aria-hidden="true" />
                <span>{t('scanner.analyzeButton')}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
