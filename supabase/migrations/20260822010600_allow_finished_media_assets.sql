-- Allow post-generation finishing to register a distinct durable video asset
-- while preserving the original generated video.

ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_asset_type_check;

ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_asset_type_check
  CHECK (asset_type IN (
    'reference_image',
    'reference_video',
    'reference_audio',
    'source_image',
    'source_video',
    'source_audio',
    'generated_video',
    'finished_video',
    'generated_image',
    'generated_audio',
    'thumbnail',
    'other'
  ));
