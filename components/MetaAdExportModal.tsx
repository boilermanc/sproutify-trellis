import React, { useEffect, useRef, useState } from 'react';
import {
  X, Loader2, RefreshCw, Download, Copy, Check, Megaphone,
  Layers, Info, AlertCircle, Save, ExternalLink,
} from 'lucide-react';
import { VideoAdJob } from '../types';
import { publishableImageUrl } from '../services/videoAdService';
import {
  META_CTA_OPTIONS, META_LIMITS, MetaAdCopy, MetaAdExportRow,
  generateMetaAdCopy, buildAdsManagerCsv, saveAdExport,
  downloadTextFile, downloadImage,
} from '../services/adExportService';

interface MetaAdExportModalProps {
  job: VideoAdJob;
  brandName: string;
  geminiApiKey: string;
  onClose: () => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Mirrors VideoAdLab's parseJobCopy — n8n writes copy as a JSON string in
// job.script ({"headline":"...","headline_variants":[...],"subhead":"...","cta":"..."}).
// Older jobs may have plain text or nothing there; never throw, fall back to caption.
function parseJobCopy(job: VideoAdJob): { headline: string; cta?: string; headline_variants: string[] } {
  if (job.script) {
    try {
      const parsed = JSON.parse(job.script);
      if (parsed && typeof parsed === 'object' && typeof parsed.headline === 'string') {
        const headline_variants = Array.isArray(parsed.headline_variants)
          ? parsed.headline_variants.filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0)
          : [];
        return {
          headline: parsed.headline,
          cta: typeof parsed.cta === 'string' ? parsed.cta : undefined,
          headline_variants,
        };
      }
    } catch {
      // job.script isn't JSON — fall through to caption/blank.
    }
  }
  return { headline: job.caption || '', headline_variants: [] };
}

const formatLabel = (job: VideoAdJob): string =>
  job.format === 'carousel' ? 'Carousel' : job.format === 'static' ? 'Static' : 'Video';

const slugify = (s: string): string =>
  (s || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '') || 'brand';

const todayYYYYMMDD = (): string => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

// Accepts bare domains ("example.com/x") as well as full URLs and normalizes
// to https:// for validation/use — most people won't type the protocol.
function normalizeUrl(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidDestinationUrl(input: string): boolean {
  const trimmed = (input || '').trim();
  if (!trimmed) return false;
  try {
    const url = new URL(normalizeUrl(trimmed));
    return !!url.hostname && url.hostname.includes('.');
  } catch {
    return false;
  }
}

const CharCounter: React.FC<{ count: number; limit: number }> = ({ count, limit }) => {
  const ratio = count / limit;
  const color = count > limit ? 'text-rose-500' : ratio >= 0.85 ? 'text-amber-500' : 'text-slate-400';
  return <span className={`text-[10px] font-bold tabular-nums ${color}`}>{count}/{limit}</span>;
};

const FIELD_LABEL = 'text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block';
const FIELD_INPUT = 'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition';

const MetaAdExportModal: React.FC<MetaAdExportModalProps> = ({ job, brandName, geminiApiKey, onClose, addToast }) => {
  const jobCopy = parseJobCopy(job);
  const media = job.format === 'carousel' && job.media_urls?.length
    ? job.media_urls
    : [publishableImageUrl(job)].filter(Boolean);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const hasGeneratedOnce = useRef(false);

  const [primaryText, setPrimaryText] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [cta, setCta] = useState<string>(META_CTA_OPTIONS[0].value);
  const [destinationUrl, setDestinationUrl] = useState('');
  const [adName, setAdName] = useState(
    `${slugify(brandName)}-${job.format || 'static'}-${todayYYYYMMDD()}-${job.id.slice(0, 6)}`,
  );

  const offer = (job.request_payload as Record<string, any> | undefined)?.message
    || (job.request_payload as Record<string, any> | undefined)?.topic
    || '';
  const audience = job.target_segment || (job.request_payload as Record<string, any> | undefined)?.target_segment || '';

  const runGenerate = async () => {
    setIsGenerating(true);
    try {
      const generated = await generateMetaAdCopy({
        apiKey: geminiApiKey,
        brandName,
        offer,
        existingHeadline: jobCopy.headline,
        headlineVariants: jobCopy.headline_variants,
        caption: job.caption || '',
        audience,
      });
      setPrimaryText(generated.primary_text);
      setHeadline(generated.headline);
      setDescription(generated.description);
      setCta(META_CTA_OPTIONS.some(o => o.value === generated.cta) ? generated.cta : META_CTA_OPTIONS[0].value);
    } catch (err: any) {
      // generateMetaAdCopy already falls back internally and shouldn't throw,
      // but guard here too so a copy failure never blocks the modal.
      addToast(`Couldn't generate ad copy: ${err.message || 'Unknown error'}. Fields left editable.`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (hasGeneratedOnce.current) return;
    hasGeneratedOnce.current = true;
    runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const urlValid = isValidDestinationUrl(destinationUrl);
  const urlTouchedInvalid = destinationUrl.trim().length > 0 && !urlValid;

  const buildCopy = (): MetaAdCopy => ({
    primary_text: primaryText,
    headline,
    description,
    cta,
    destination_url: urlValid ? normalizeUrl(destinationUrl) : destinationUrl.trim(),
    ad_name: adName,
  });

  const imageFileName = `${slugify(brandName)}-${job.format || 'static'}-${job.id.slice(0, 8)}.png`;

  const buildCsvRow = (): MetaAdExportRow => ({
    campaign_name: `${brandName} — ${formatLabel(job)} Ads`,
    ad_set_name: audience || 'General Audience',
    ad_name: adName,
    headline,
    primary_text: primaryText,
    link_description: description,
    cta,
    destination_url: urlValid ? normalizeUrl(destinationUrl) : destinationUrl.trim(),
    image_file_name: imageFileName,
  });

  const copyAllToClipboard = async () => {
    const c = buildCopy();
    const text = [
      `Ad Name: ${c.ad_name}`,
      `Primary Text: ${c.primary_text}`,
      `Headline: ${c.headline}`,
      `Description: ${c.description}`,
      `Call to Action: ${c.cta}`,
      `Destination URL: ${c.destination_url}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey('all');
      setTimeout(() => setCopiedKey(k => (k === 'all' ? null : k)), 1800);
      addToast('All fields copied — paste into Ads Manager\'s ad creation form.', 'success');
    } catch {
      addToast('Could not copy — check browser clipboard permissions.', 'error');
    }
  };

  const handleDownloadImage = async () => {
    const url = media[0];
    if (!url) { addToast('No image to download.', 'error'); return; }
    setIsDownloadingImage(true);
    try {
      await downloadImage(url, imageFileName);
      addToast('Image downloaded.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Image download failed.', 'error');
    } finally {
      setIsDownloadingImage(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!urlValid) { addToast('Add a valid destination URL before exporting.', 'error'); return; }
    const csv = buildAdsManagerCsv([buildCsvRow()]);
    downloadTextFile(`${adName || 'meta-ad'}.csv`, csv, 'text/csv');
    addToast('CSV row downloaded.', 'success');
  };

  const handleSave = async () => {
    if (!urlValid) { addToast('Add a valid destination URL before saving.', 'error'); return; }
    setIsSaving(true);
    try {
      await saveAdExport(job.id, buildCopy());
      addToast('Ad export saved to this job — you can match performance data back to it later by ad name.', 'success');
    } catch (err: any) {
      addToast(`Save failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const exportGated = !urlValid;

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <div
          className="bg-white w-full max-w-3xl max-h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-white/20"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center shrink-0">
                <Megaphone size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight truncate">Export for Meta Ads</h2>
                <p className="text-xs text-slate-400 truncate">{brandName} · {formatLabel(job)} creative</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-slate-50 rounded-lg transition shrink-0">
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Explainer */}
            <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-100 rounded-xl px-3.5 py-3">
              <Info size={15} className="text-sky-500 mt-0.5 shrink-0" />
              <p className="text-xs text-sky-700 leading-relaxed">
                This is a <span className="font-bold">manual Ads Manager workflow</span> — Trellis doesn't post ads
                directly to Meta. Publishing via the Marketing API requires Meta App Review, which we're deliberately
                not blocking on. Download the creative and copy below, then build the ad yourself in Ads Manager.
              </p>
            </div>

            {/* Creative preview */}
            <div>
              <span className={FIELD_LABEL}>Creative</span>
              {media.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {media.map((url, i) => (
                    <img key={i} src={url} alt={`Slide ${i + 1}`} className="w-28 h-28 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                  ))}
                </div>
              ) : media[0] ? (
                <img src={media[0]} alt="Ad creative" className="w-full max-w-xs rounded-xl border border-slate-200" />
              ) : (
                <div className="w-full max-w-xs h-32 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
                  <Layers size={20} />
                </div>
              )}
            </div>

            {/* Generating state */}
            {isGenerating && (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin text-emerald-500" />
                Writing ad copy — primary text, headline, description…
              </div>
            )}

            {/* Headline variant chips */}
            {jobCopy.headline_variants.length > 1 && (
              <div className="space-y-1.5">
                <span className={FIELD_LABEL}>Headline angles already written</span>
                <div className="flex flex-wrap gap-1.5">
                  {jobCopy.headline_variants.map((variant, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setHeadline(variant)}
                      className={`text-left border rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        variant === headline
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {variant}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Primary text */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Primary Text</label>
                <CharCounter count={primaryText.length} limit={META_LIMITS.primary_text} />
              </div>
              <textarea
                value={primaryText}
                onChange={e => setPrimaryText(e.target.value)}
                rows={3}
                placeholder="The body copy above the image — hook in the first sentence."
                className={`${FIELD_INPUT} resize-none`}
              />
            </div>

            {/* Headline + Description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Headline</label>
                  <CharCounter count={headline.length} limit={META_LIMITS.headline} />
                </div>
                <input
                  value={headline}
                  onChange={e => setHeadline(e.target.value)}
                  placeholder="Bold line under the image"
                  className={FIELD_INPUT}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Description</label>
                  <CharCounter count={description.length} limit={META_LIMITS.description} />
                </div>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional — often hidden"
                  className={FIELD_INPUT}
                />
              </div>
            </div>

            {/* CTA + Destination URL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL}>Call To Action</label>
                <select value={cta} onChange={e => setCta(e.target.value)} className={FIELD_INPUT}>
                  {META_CTA_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={FIELD_LABEL}>Destination URL *</label>
                <input
                  value={destinationUrl}
                  onChange={e => setDestinationUrl(e.target.value)}
                  placeholder="atlurbanfarms.com/shop"
                  className={`${FIELD_INPUT} ${urlTouchedInvalid ? 'border-rose-300 focus:border-rose-400' : ''}`}
                />
                {urlTouchedInvalid && (
                  <p className="text-[10px] text-rose-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> Doesn't look like a valid URL.
                  </p>
                )}
              </div>
            </div>

            {/* Ad name */}
            <div>
              <label className={FIELD_LABEL}>Ad Name</label>
              <input
                value={adName}
                onChange={e => setAdName(e.target.value)}
                placeholder="brand-format-yyyymmdd-id"
                className={FIELD_INPUT}
              />
              <p className="text-[10px] text-slate-400 mt-1">Used to match performance data back to this creative later.</p>
            </div>

            {/* Regenerate */}
            <div>
              <button
                type="button"
                onClick={runGenerate}
                disabled={isGenerating}
                className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition disabled:opacity-30 flex items-center gap-2"
              >
                {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {isGenerating ? 'Regenerating…' : 'Regenerate copy'}
              </button>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex flex-wrap items-center gap-2.5 px-6 py-4 border-t border-slate-100 shrink-0 bg-slate-50/60">
            <button
              onClick={handleDownloadImage}
              disabled={isDownloadingImage || !media[0]}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-white transition disabled:opacity-30 flex items-center gap-2"
            >
              {isDownloadingImage ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {isDownloadingImage ? 'Downloading…' : 'Download image'}
            </button>
            <button
              onClick={handleDownloadCsv}
              disabled={exportGated}
              title={exportGated ? 'Add a valid destination URL first' : 'Download a bulk-import-style CSV row'}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-white transition disabled:opacity-30 flex items-center gap-2"
            >
              <Download size={15} /> Download CSV row
            </button>
            <button
              onClick={copyAllToClipboard}
              disabled={exportGated}
              title={exportGated ? 'Add a valid destination URL first' : 'Copy all fields for pasting into Ads Manager'}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-white transition disabled:opacity-30 flex items-center gap-2"
            >
              {copiedKey === 'all' ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
              Copy all fields
            </button>
            <div className="flex-1" />
            <button
              onClick={handleSave}
              disabled={isSaving || exportGated}
              title={exportGated ? 'Add a valid destination URL first' : 'Save this export to the job'}
              className="px-5 py-2.5 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition disabled:opacity-30 flex items-center gap-2"
            >
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <div className="px-6 pb-4 -mt-1 shrink-0">
            <a
              href="https://www.facebook.com/adsmanager"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-slate-400 hover:text-slate-500 flex items-center gap-1"
            >
              <ExternalLink size={10} /> Open Ads Manager to build the ad
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

export default MetaAdExportModal;
