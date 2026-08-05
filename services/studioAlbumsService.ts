import { StudioAlbum, StudioCoverConcept, StudioMaster, StudioPublication, StudioPublicationDraft, StudioReleaseIdentity, StudioTrack, StudioVideo } from '../types';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type CreateStudioAlbum = Pick<StudioAlbum, 'title' | 'artist_name' | 'genre' | 'mood' | 'era' | 'theme' | 'vocal_direction' | 'target_duration_seconds'> & { description?: string; style_preset_id?: string; style_profile?: Record<string, unknown> };
export interface StudioBatchGenerationResult { tracks: StudioTrack[]; failures: Array<{ track_id: string; title: string; error: string }>; }
export interface StudioBulkApprovalResult { tracks: StudioTrack[]; remaining_review_count: number; }

const RETRYABLE_STUDIO_READS = new Set(['list', 'tracks', 'list_cover_concepts', 'list_video_artwork']);

async function studioFunctionError(error: unknown): Promise<{ message: string; status?: number }> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context.status;
    try {
      const payload = await error.context.clone().json();
      const message = typeof payload?.error === 'string' ? payload.error : typeof payload?.message === 'string' ? payload.message : error.message;
      return { message, status };
    } catch {
      return { message: error.message, status };
    }
  }
  return { message: error instanceof Error ? error.message : 'Studio request failed.' };
}

async function callStudio(action: string, payload: Record<string, unknown> = {}): Promise<any> {
  const attempts = RETRYABLE_STUDIO_READS.has(action) ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase.functions.invoke('studio-albums', { body: { action, ...payload } });
    if (!error) {
      if (data?.error) throw new Error(data.error);
      return data;
    }
    const details = await studioFunctionError(error);
    if (details.status === 503 && attempt < attempts - 1) {
      await new Promise(resolve => window.setTimeout(resolve, 400 * (attempt + 1)));
      continue;
    }
    throw new Error(details.message);
  }
  throw new Error('Studio request failed after retrying.');
}

export async function getStudioAlbums(): Promise<StudioAlbum[]> {
  return (await callStudio('list')).albums as StudioAlbum[];
}

export async function createStudioAlbum(album: CreateStudioAlbum): Promise<StudioAlbum> {
  return (await callStudio('create', { album })).album as StudioAlbum;
}

export async function getStudioTracks(albumId: string): Promise<StudioTrack[]> {
  return (await callStudio('tracks', { album_id: albumId })).tracks as StudioTrack[];
}

export async function getStudioAlbumWorkspace(albumId: string): Promise<{ tracks: StudioTrack[]; master: StudioMaster; video: StudioVideo; publication: StudioPublication | null }> {
  const data = await callStudio('tracks', { album_id: albumId });
  return { tracks: data.tracks as StudioTrack[], master: data.master as StudioMaster, video: data.video as StudioVideo, publication: (data.publication || null) as StudioPublication | null };
}

export async function planStudioTrack(albumId: string): Promise<{ title: string; prompt: string }> {
  const { data, error } = await supabase.functions.invoke('studio-track-planner', { body: { album_id: albumId } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data.track as { title: string; prompt: string };
}

export async function planStudioAlbum(albumId: string, trackCount: number): Promise<StudioTrack[]> {
  const { data, error } = await supabase.functions.invoke('studio-album-planner', { body: { album_id: albumId, track_count: trackCount } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data.tracks as StudioTrack[];
}

export type StudioTrackDraft = { title: string; prompt: string; duration_seconds: number };

export async function createPlannedStudioTrack(albumId: string, track: StudioTrackDraft): Promise<StudioTrack> {
  return (await callStudio('create_planned_track', { album_id: albumId, track })).track as StudioTrack;
}

export async function updatePlannedStudioTrack(trackId: string, track: StudioTrackDraft): Promise<StudioTrack> {
  return (await callStudio('update_planned_track', { track_id: trackId, track })).track as StudioTrack;
}

export async function deletePlannedStudioTrack(trackId: string): Promise<void> {
  await callStudio('delete_planned_track', { track_id: trackId });
}

export async function generatePlannedStudioTrack(trackId: string): Promise<StudioTrack> {
  return (await callStudio('generate_planned_track', { track_id: trackId })).track as StudioTrack;
}

export async function approvePlannedStudioTrack(trackId: string): Promise<StudioTrack> {
  return (await callStudio('approve_planned_track', { track_id: trackId })).track as StudioTrack;
}

export async function approveAllPlannedStudioTracks(albumId: string): Promise<StudioTrack[]> {
  return (await callStudio('approve_all_planned_tracks', { album_id: albumId })).tracks as StudioTrack[];
}

export async function generateAllApprovedStudioTracks(albumId: string): Promise<StudioBatchGenerationResult> {
  const data = await callStudio('generate_all_approved_tracks', { album_id: albumId });
  return { tracks: data.tracks as StudioTrack[], failures: (data.failures || []) as StudioBatchGenerationResult['failures'] };
}

export async function approveAllGeneratedStudioTracks(albumId: string): Promise<StudioBulkApprovalResult> {
  const data = await callStudio('approve_all_generated_tracks', { album_id: albumId });
  return { tracks: data.tracks as StudioTrack[], remaining_review_count: Number(data.remaining_review_count || 0) };
}

export async function reopenStudioTrackReview(trackId: string): Promise<StudioTrack> {
  return (await callStudio('reopen_track_review', { track_id: trackId })).track as StudioTrack;
}

export async function buildStudioMaster(albumId: string): Promise<StudioMaster> {
  return (await callStudio('build_master', { album_id: albumId })).master as StudioMaster;
}

export async function approveStudioMaster(albumId: string): Promise<StudioMaster> {
  return (await callStudio('approve_master', { album_id: albumId })).master as StudioMaster;
}

export async function saveStudioReleaseIdentity(albumId: string, identity: StudioReleaseIdentity): Promise<StudioAlbum> {
  return (await callStudio('update_release_identity', { album_id: albumId, identity })).album as StudioAlbum;
}

export async function approveStudioReleaseIdentity(albumId: string): Promise<StudioAlbum> {
  return (await callStudio('approve_release_identity', { album_id: albumId })).album as StudioAlbum;
}

export async function getStudioCoverConcepts(albumId: string): Promise<StudioCoverConcept[]> { return (await callStudio('list_cover_concepts', { album_id: albumId })).concepts as StudioCoverConcept[]; }
export interface StudioCoverDirection {
  style_id: string;
  style_prompt: string;
  style_setting: string;
  custom_direction: string;
}
export async function generateStudioCoverConcept(albumId: string, direction: StudioCoverDirection): Promise<StudioCoverConcept> { return (await callStudio('generate_cover_concept', { album_id: albumId, ...direction })).concept as StudioCoverConcept; }
export interface StudioCoverTypography { title: string; subtitle: string; series: string; treatment: string; vintage_border: boolean; }
export async function saveStudioCoverComposite(albumId: string, sourceAssetId: string, imageBase64: string, typography: StudioCoverTypography): Promise<StudioCoverConcept> { return (await callStudio('save_cover_composite', { album_id: albumId, source_asset_id: sourceAssetId, image_base64: imageBase64, typography })).concept as StudioCoverConcept; }
export async function enhanceStudioCoverConcept(albumId: string, sourceAssetId: string, direction: string): Promise<StudioCoverConcept> { return (await callStudio('enhance_cover_concept', { album_id: albumId, source_asset_id: sourceAssetId, direction })).concept as StudioCoverConcept; }
export async function deleteStudioCoverConcept(assetId: string): Promise<void> { await callStudio('delete_cover_concept', { asset_id: assetId }); }
export async function selectStudioCoverConcept(assetId: string): Promise<StudioCoverConcept> { return (await callStudio('select_cover_concept', { asset_id: assetId })).concept as StudioCoverConcept; }
export async function approveStudioCover(albumId: string): Promise<StudioAlbum> { return (await callStudio('approve_cover', { album_id: albumId })).album as StudioAlbum; }
export async function getStudioVideoArtwork(albumId: string): Promise<StudioCoverConcept[]> { return (await callStudio('list_video_artwork', { album_id: albumId })).concepts as StudioCoverConcept[]; }
export async function generateStudioVideoArtwork(albumId: string): Promise<StudioCoverConcept> { return (await callStudio('generate_video_artwork', { album_id: albumId })).concept as StudioCoverConcept; }
export async function saveStudioVideoArtworkComposite(albumId: string, sourceAssetId: string, imageBase64: string, typography: StudioCoverTypography): Promise<StudioCoverConcept> { return (await callStudio('save_video_artwork_composite', { album_id: albumId, source_asset_id: sourceAssetId, image_base64: imageBase64, typography })).concept as StudioCoverConcept; }
export async function approveStudioVideoArtwork(albumId: string): Promise<StudioCoverConcept> { return (await callStudio('approve_video_artwork', { album_id: albumId })).concept as StudioCoverConcept; }
export async function prepareStudioVisualProduction(albumId: string, motion: string, direction: string): Promise<StudioAlbum> { return (await callStudio('prepare_visual_production', { album_id: albumId, motion, direction })).album as StudioAlbum; }
export async function approveStudioVideo(albumId: string): Promise<StudioAlbum> { return (await callStudio('approve_video', { album_id: albumId })).album as StudioAlbum; }
export async function prepareStudioPublication(albumId: string): Promise<StudioPublication> { return (await callStudio('prepare_publication', { album_id: albumId })).publication as StudioPublication; }
export async function saveStudioPublication(albumId: string, publication: StudioPublicationDraft): Promise<StudioPublication> { return (await callStudio('save_publication', { album_id: albumId, publication })).publication as StudioPublication; }
export async function approveStudioPublication(albumId: string): Promise<StudioPublication> { return (await callStudio('approve_publication', { album_id: albumId })).publication as StudioPublication; }
export async function publishStudioAlbum(albumId: string): Promise<StudioPublication> { return (await callStudio('publish_album', { album_id: albumId })).publication as StudioPublication; }

export async function generateStudioTrack(albumId: string, track: { title: string; prompt: string; duration_seconds: number }): Promise<StudioTrack> {
  return (await callStudio('generate_one', { album_id: albumId, track })).track as StudioTrack;
}

export async function reviewStudioTrack(trackId: string, approved: boolean, rejectionReason?: string): Promise<StudioTrack> {
  return (await callStudio('review_track', { track_id: trackId, approved, rejection_reason: rejectionReason })).track as StudioTrack;
}
