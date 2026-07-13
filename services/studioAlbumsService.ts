import { StudioAlbum, StudioTrack } from '../types';
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

export async function generateStudioTrack(albumId: string, track: { title: string; prompt: string; duration_seconds: number }): Promise<StudioTrack> {
  return (await callStudio('generate_one', { album_id: albumId, track })).track as StudioTrack;
}

export async function reviewStudioTrack(trackId: string, approved: boolean, rejectionReason?: string): Promise<StudioTrack> {
  return (await callStudio('review_track', { track_id: trackId, approved, rejection_reason: rejectionReason })).track as StudioTrack;
}
