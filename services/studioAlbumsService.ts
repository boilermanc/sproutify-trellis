import { StudioAlbum, StudioMaster, StudioTrack } from '../types';
import { supabase } from '../lib/supabase';

export type CreateStudioAlbum = Pick<StudioAlbum, 'title' | 'artist_name' | 'genre' | 'mood' | 'era' | 'theme' | 'vocal_direction' | 'target_duration_seconds'> & { description?: string };

async function callStudio(action: string, payload: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await supabase.functions.invoke('studio-albums', { body: { action, ...payload } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
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

export async function getStudioAlbumWorkspace(albumId: string): Promise<{ tracks: StudioTrack[]; master: StudioMaster }> {
  const data = await callStudio('tracks', { album_id: albumId });
  return { tracks: data.tracks as StudioTrack[], master: data.master as StudioMaster };
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

export async function generateAllApprovedStudioTracks(albumId: string): Promise<StudioTrack[]> {
  return (await callStudio('generate_all_approved_tracks', { album_id: albumId })).tracks as StudioTrack[];
}

export async function approveAllGeneratedStudioTracks(albumId: string): Promise<StudioTrack[]> {
  return (await callStudio('approve_all_generated_tracks', { album_id: albumId })).tracks as StudioTrack[];
}

export async function buildStudioMaster(albumId: string): Promise<StudioMaster> {
  return (await callStudio('build_master', { album_id: albumId })).master as StudioMaster;
}

export async function generateStudioTrack(albumId: string, track: { title: string; prompt: string; duration_seconds: number }): Promise<StudioTrack> {
  return (await callStudio('generate_one', { album_id: albumId, track })).track as StudioTrack;
}

export async function reviewStudioTrack(trackId: string, approved: boolean, rejectionReason?: string): Promise<StudioTrack> {
  return (await callStudio('review_track', { track_id: trackId, approved, rejection_reason: rejectionReason })).track as StudioTrack;
}
