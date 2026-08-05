import { supabase } from '../lib/supabase';
import { YouTubeDailyMetric } from '../types';

export interface VideoPerformanceRow {
  youtube_video_id: string;
  title: string;
  pipeline: 'episode' | 'studio';
  external_url: string;
  total_views: number | null;
  seven_day_views: number;
  seven_day_watch_minutes: number;
  latest_retention_pct: number;
  likes: number;
  comments: number;
  latest_metric_date: string;
  synced_at: string | null;
}

// Aggregates trellis_youtube_daily_metrics (written by the E9 n8n sync) into one row
// per video, across BOTH the Episodes and Studio Albums pipelines. Titles are resolved
// with a second pass so this stays a plain reporting read — no episode/studio service coupling.
export async function getYouTubePerformance(): Promise<VideoPerformanceRow[]> {
  const { data, error } = await supabase
    .from('trellis_youtube_daily_metrics')
    .select('*')
    .order('metric_date', { ascending: false });
  if (error) throw new Error(`Failed to load YouTube performance: ${error.message}`);

  const byVideo = new Map<string, YouTubeDailyMetric[]>();
  ((data as YouTubeDailyMetric[]) ?? []).forEach(row => {
    const list = byVideo.get(row.youtube_video_id);
    if (list) list.push(row);
    else byVideo.set(row.youtube_video_id, [row]);
  });

  const episodeIds = new Set<string>();
  const studioAlbumIds = new Set<string>();
  byVideo.forEach(rows => {
    const latest = rows[0];
    if (latest.studio_album_id) studioAlbumIds.add(latest.studio_album_id);
    else if (latest.episode_id) episodeIds.add(latest.episode_id);
  });

  const [episodesRes, albumsRes] = await Promise.all([
    episodeIds.size
      ? supabase.from('trellis_episodes').select('id,title').in('id', Array.from(episodeIds))
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    studioAlbumIds.size
      ? supabase.from('studio_albums').select('id,title,artist_name').in('id', Array.from(studioAlbumIds))
      : Promise.resolve({ data: [] as { id: string; title: string; artist_name: string }[] }),
  ]);
  const episodeTitles = new Map((episodesRes.data ?? []).map(e => [e.id, e.title]));
  const albumTitles = new Map((albumsRes.data ?? []).map(a => [a.id, `${a.artist_name} — ${a.title}`]));

  const rows: VideoPerformanceRow[] = Array.from(byVideo.entries()).map(([youtube_video_id, metrics]) => {
    const latest = metrics[0];
    const sevenDay = metrics.slice(0, 7);
    const sevenDayViews = sevenDay.reduce((sum, r) => sum + Number(r.views || 0), 0);
    const sevenDayWatchMinutes = sevenDay.reduce((sum, r) => sum + Number(r.estimated_minutes_watched || 0), 0);
    const publicStats = (latest.raw as { public_statistics?: { viewCount?: string | number } } | null)?.public_statistics;
    const totalViews = publicStats?.viewCount != null ? Number(publicStats.viewCount) : null;
    const pipeline: 'episode' | 'studio' = latest.studio_album_id ? 'studio' : 'episode';
    const title = pipeline === 'studio'
      ? (albumTitles.get(latest.studio_album_id!) || 'Studio Album release')
      : (episodeTitles.get(latest.episode_id!) || 'Trellis Episode');
    const externalUrl = (latest.raw as { external_url?: string } | null)?.external_url || `https://youtu.be/${youtube_video_id}`;
    return {
      youtube_video_id,
      title,
      pipeline,
      external_url: externalUrl,
      total_views: totalViews,
      seven_day_views: sevenDayViews,
      seven_day_watch_minutes: sevenDayWatchMinutes,
      latest_retention_pct: Number(latest.average_view_percentage || 0),
      likes: Number(latest.likes || 0),
      comments: Number(latest.comments || 0),
      latest_metric_date: latest.metric_date,
      synced_at: latest.synced_at,
    };
  });

  return rows.sort((a, b) => (b.total_views ?? b.seven_day_views) - (a.total_views ?? a.seven_day_views));
}
