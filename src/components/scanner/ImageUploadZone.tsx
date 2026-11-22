import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ImagePlus, Trash2, Upload } from 'lucide-react';
import type { OrganType } from '../../types/plant';
import { MAX_IMAGES_PER_SCAN } from '../../lib/utils';
import { Button } from '../ui/button';

export interface SelectedPlantImage {
  id: string;
  file: File;
  previewUrl: string;
  organ: OrganType;
}

interface ImageUploadZoneProps {
  images: SelectedPlantImage[];
  disabled?: boolean;
  onAddFiles: (files: File[]) => void;
  onRemoveImage: (id: string) => void;
  onOrganChange: (id: string, organ: OrganType) => void;
  onClearAll: () => void;
}

const ORGAN_OPTIONS: OrganType[] = ['auto', 'leaf', 'flower', 'fruit', 'bark'];

export function ImageUploadZone({
  images,
  disabled = false,
  onAddFiles,
  onRemoveImage,
  onOrganChange,
  onClearAll,
}: ImageUploadZoneProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const atLimit = images.length >= MAX_IMAGES_PER_SCAN;

  const handleFileInput = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    onAddFiles(Array.from(fileList));
  };

  return (
    <div className="space-y-6">
      {/* Main Drag & Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !atLimit) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (disabled || atLimit) return;
          handleFileInput(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed ${
          images.length > 0 ? 'p-6' : 'p-8 sm:p-10'
        } text-center transition-colors duration-150 ${
          isDragging
            ? 'border-[#166534] bg-[#ECFDF3]/60'
            : 'border-[#C5D3CB] bg-white hover:border-[#8FA99B]'
        } ${disabled || atLimit ? 'opacity-70' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          multiple
          disabled={disabled || atLimit}
          onChange={(e) => {
            handleFileInput(e.target.files);
            e.target.value = '';
          }}
          className="sr-only"
          aria-label={t('scanner.browseButton')}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          disabled={disabled || atLimit}
          onChange={(e) => {
            handleFileInput(e.target.files);
            e.target.value = '';
          }}
          className="sr-only"
          aria-label={t('scanner.cameraButton')}
        />

        <div className="mx-auto flex max-w-lg flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#F1F5F3] text-[#166534]">
            <Upload className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-[#111C17]">
            {t('scanner.dropzoneTitle')}
          </h2>
          <p className="mt-1.5 text-sm text-[#4B5D54]">{t('scanner.dropzoneFormats')}</p>
          <p className="mt-2 text-xs font-medium text-[#166534]">
            {t('scanner.samePlantNote')}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              variant="default"
              disabled={disabled || atLimit}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              <span>{t('scanner.browseButton')}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={disabled || atLimit}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              <span>{t('scanner.cameraButton')}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Image Count Bar & Previews */}
      <div className="flex items-center justify-between gap-4 border-b border-[#DCE4DF] pb-3">
        <p className="font-mono text-xs font-medium tabular-nums text-[#4B5D54]" data-testid="image-count">
          {t('scanner.imageCount', { count: images.length, max: MAX_IMAGES_PER_SCAN })}
        </p>
        {images.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={onClearAll}
            className="text-xs font-medium text-[#4B5D54] hover:text-[#BE123C] transition-colors cursor-pointer disabled:opacity-50"
          >
            {t('scanner.clearAll')}
          </button>
        )}
      </div>

      {images.length > 0 && (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="image-preview-grid"
        >
          {images.map((item) => (
            <div
              key={item.id}
              className="overflow-hidden rounded-lg border border-[#DCE4DF] bg-white"
            >
              <div className="relative aspect-[4/3] w-full bg-[#F1F5F3]">
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemoveImage(item.id)}
                  aria-label={t('scanner.removeImage', { name: item.file.name })}
                  className="absolute right-2.5 top-2.5 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/95 text-[#111C17] border border-[#DCE4DF] hover:bg-[#FFF1F2] hover:text-[#BE123C] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="space-y-2.5 p-3.5">
                <div className="flex items-center justify-between gap-2 text-xs text-[#4B5D54]">
                  <span className="truncate font-medium text-[#111C17]" title={item.file.name}>
                    {item.file.name}
                  </span>
                  <span className="font-mono tabular-nums shrink-0">
                    {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor={`organ-${item.id}`}
                    className="text-xs font-medium text-[#4B5D54] whitespace-nowrap"
                  >
                    {t('scanner.organLabel')}
                  </label>
                  <select
                    id={`organ-${item.id}`}
                    disabled={disabled}
                    value={item.organ}
                    onChange={(e) => onOrganChange(item.id, e.target.value as OrganType)}
                    className="h-8 rounded-md border border-[#DCE4DF] bg-[#F8FAF9] px-2.5 text-xs font-medium text-[#111C17] focus:border-[#166534] focus:outline-none focus:ring-1 focus:ring-[#166534]"
                  >
                    {ORGAN_OPTIONS.map((organ) => (
                      <option key={organ} value={organ}>
                        {t(`scanner.organs.${organ}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
