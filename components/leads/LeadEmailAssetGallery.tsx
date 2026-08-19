import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, RefreshCw, Upload } from 'lucide-react';
import {
  BrandGalleryAsset,
  listBrandGalleryAssets,
  uploadBrandGalleryAsset,
} from '../../services/brandAssetLibraryService';
import { SPROUTIFY_FARM_LOGO_URL } from './templates/sproutifyFarmPartnershipHtml';

interface LeadEmailAssetGalleryProps {
  branchSlug: string;
  onInsert: (asset: BrandGalleryAsset) => void;
}

const curatedAssets = (branchSlug: string): BrandGalleryAsset[] => branchSlug === 'sproutify-farm' ? [{
  name: 'Sproutify Farm logo',
  path: 'curated/sproutify-farm-logo',
  url: SPROUTIFY_FARM_LOGO_URL,
}] : [];

const LeadEmailAssetGallery: React.FC<LeadEmailAssetGalleryProps> = ({ branchSlug, onInsert }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<BrandGalleryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const stored = await listBrandGalleryAssets(branchSlug);
      const curated = curatedAssets(branchSlug);
      setAssets([...curated, ...stored.filter(asset => !curated.some(item => item.url === asset.url))]);
    } catch (loadError) {
      setAssets(curatedAssets(branchSlug));
      setError(loadError instanceof Error ? loadError.message : 'Could not load the image gallery.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [branchSlug]);

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const asset = await uploadBrandGalleryAsset(branchSlug, file);
      await load();
      onInsert(asset);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Image upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-2xl border border-cyan-400/15 bg-[#0A0E27] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cyan-200"><ImageIcon size={14} />Email image gallery</p>
          <p className="mt-1 text-[10px] text-slate-500">Click an image to insert it at the HTML cursor.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} title="Refresh gallery" className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-cyan-200 disabled:opacity-40"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 rounded-lg bg-cyan-400/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-cyan-200 hover:bg-cyan-400/15 disabled:opacity-40">{uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}Upload</button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={event => void upload(event.target.files?.[0])} />
        </div>
      </div>
      {error && <p className="mb-3 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-[10px] text-rose-200">{error}</p>}
      {loading ? (
        <div className="flex h-24 items-center justify-center text-slate-500"><Loader2 size={18} className="animate-spin" /></div>
      ) : assets.length === 0 ? (
        <button type="button" onClick={() => inputRef.current?.click()} className="h-24 w-full rounded-xl border border-dashed border-white/10 text-xs font-bold text-slate-500 hover:border-cyan-400/30 hover:text-cyan-200">Upload the first reusable email image</button>
      ) : (
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map(asset => <button key={asset.path} type="button" onClick={() => onInsert(asset)} title={`Insert ${asset.name}`} className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left hover:border-cyan-400/40"><img src={asset.url} alt={asset.name} className="h-24 w-full bg-slate-900 object-contain p-2" /><span className="block truncate px-2 py-1.5 text-[9px] font-bold text-slate-400 group-hover:text-cyan-200">{asset.name}</span></button>)}
        </div>
      )}
    </div>
  );
};

export default LeadEmailAssetGallery;
