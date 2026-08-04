import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, RefreshCw, RotateCcw, Upload } from 'lucide-react';
import type { BrandGalleryAsset, TemplateImageSlot } from '../services/brandAssetLibraryService';

interface CampaignBrandAssetLibraryProps {
  brandName: string;
  assets: BrandGalleryAsset[];
  imageSlots: TemplateImageSlot[];
  imageOverrides: Record<string, string>;
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;
  onRefresh: () => void;
  onUpload: (file: File) => Promise<BrandGalleryAsset | null>;
  onSelect: (originalSource: string, assetUrl: string) => void;
  onReset: (originalSource: string) => void;
}

const CampaignBrandAssetLibrary: React.FC<CampaignBrandAssetLibraryProps> = ({
  brandName,
  assets,
  imageSlots,
  imageOverrides,
  isLoading,
  isUploading,
  error,
  onRefresh,
  onUpload,
  onSelect,
  onReset,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeSource, setActiveSource] = useState(imageSlots[0]?.source || '');

  useEffect(() => {
    if (!imageSlots.some(slot => slot.source === activeSource)) {
      setActiveSource(imageSlots[0]?.source || '');
    }
  }, [imageSlots, activeSource]);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    const asset = await onUpload(file);
    if (asset && activeSource) onSelect(activeSource, asset.url);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs flex items-center">
            <ImageIcon size={16} className="mr-3 text-emerald-600" />
            Brand Asset Library
          </h4>
          <p className="mt-1 text-[11px] text-slate-400">
            Reuse approved {brandName} images and replace pictures already in this email.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200 disabled:opacity-50"
            title="Refresh asset library"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50"
          >
            {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Upload
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={event => handleUpload(event.target.files?.[0])}
          />
        </div>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-700">{error}</p>}

      {imageSlots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-[11px] text-slate-500">
          This template has no image blocks to replace. Add an image in Brand Intelligence → Email Templates, then return here.
        </div>
      ) : (
        <>
          <div>
            <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Choose an email image</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {imageSlots.map(slot => {
                const current = imageOverrides[slot.source] || slot.source;
                const isActive = activeSource === slot.source;
                return (
                  <button
                    key={slot.source}
                    type="button"
                    onClick={() => setActiveSource(slot.source)}
                    className={`overflow-hidden rounded-xl border text-left transition ${isActive ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <img src={current} alt="" className="h-20 w-full bg-slate-100 object-cover" />
                    <span className="block truncate px-2 py-1.5 text-[9px] font-bold text-slate-600">{slot.label}</span>
                  </button>
                );
              })}
            </div>
            {activeSource && imageOverrides[activeSource] && (
              <button
                type="button"
                onClick={() => onReset(activeSource)}
                className="mt-2 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-600"
              >
                <RotateCcw size={11} /> Restore template image
              </button>
            )}
          </div>

          <div>
            <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Pick a library image</p>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-slate-50 py-8 text-xs font-bold text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Loading images…
              </div>
            ) : assets.length === 0 ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-8 text-xs font-bold text-slate-500 hover:border-emerald-300 hover:text-emerald-700"
              >
                Upload the first image for this brand
              </button>
            ) : (
              <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                {assets.map(asset => (
                  <button
                    key={asset.path}
                    type="button"
                    onClick={() => activeSource && onSelect(activeSource, asset.url)}
                    disabled={!activeSource}
                    title={`Use ${asset.name}`}
                    className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <img src={asset.url} alt={asset.name} className="h-20 w-full object-cover transition group-hover:scale-105" />
                    <span className="block truncate px-2 py-1 text-[8px] font-bold text-slate-500">{asset.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CampaignBrandAssetLibrary;
