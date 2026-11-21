import { supabase } from '../lib/supabase';

const BRAND_ASSET_BUCKET = 'email-assets';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export interface BrandGalleryAsset {
  name: string;
  path: string;
  url: string;
  createdAt?: string;
}

export interface TemplateImageSlot {
  source: string;
  label: string;
}

const galleryPath = (branchSlug: string) => `${branchSlug}/gallery`;

const isImageAssetName = (name: string) => /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(name);

export function extractTemplateImageSlots(html: string): TemplateImageSlot[] {
  const slots: TemplateImageSlot[] = [];
  const seen = new Set<string>();
  const imageTags = html.match(/<img\b[^>]*>/gi) || [];

  for (const tag of imageTags) {
    const source = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim();
    if (!source || seen.has(source)) continue;
    const alt = tag.match(/\balt\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim();
    seen.add(source);
    slots.push({ source, label: alt || `Template image ${slots.length + 1}` });
  }

  return slots;
}

export function applyTemplateImageOverrides(
  html: string,
  overrides: Record<string, string>,
): string {
  if (Object.keys(overrides).length === 0) return html;

  return html.replace(
    /(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi,
    (tag, prefix: string, source: string, suffix: string) => {
      const replacement = overrides[source]?.trim();
      return replacement ? `${prefix}${replacement}${suffix}` : tag;
    },
  );
}

export async function listBrandGalleryAssets(branchSlug: string): Promise<BrandGalleryAsset[]> {
  if (!branchSlug) return [];
  const folder = galleryPath(branchSlug);
  const { data, error } = await supabase.storage
    .from(BRAND_ASSET_BUCKET)
    .list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) throw new Error(`Could not load the brand asset library: ${error.message}`);

  return (data || [])
    // This consumer replaces <img> blocks in campaigns. Brand DNA can also
    // store PDFs in the shared gallery, but documents are not valid image
    // replacements and must not appear here as broken thumbnails.
    .filter(file => file.name !== '.emptyFolderPlaceholder' && isImageAssetName(file.name))
    .map(file => {
      const path = `${folder}/${file.name}`;
      const { data: publicData } = supabase.storage.from(BRAND_ASSET_BUCKET).getPublicUrl(path);
      return {
        name: file.name,
        path,
        url: publicData.publicUrl,
        createdAt: file.created_at || undefined,
      };
    });
}

export async function uploadBrandGalleryAsset(
  branchSlug: string,
  file: File,
): Promise<BrandGalleryAsset> {
  if (!branchSlug) throw new Error('Choose a brand before uploading an image.');
  if (!file.type.startsWith('image/')) throw new Error('Brand assets must be image files.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Images must be 6MB or smaller.');

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const unique = Math.random().toString(36).slice(2, 8);
  const path = `${galleryPath(branchSlug)}/${Date.now()}_${unique}_${safeName}`;
  const { error } = await supabase.storage
    .from(BRAND_ASSET_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });

  if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);

  const { data } = supabase.storage.from(BRAND_ASSET_BUCKET).getPublicUrl(path);
  return { name: safeName, path, url: data.publicUrl, createdAt: new Date().toISOString() };
}
