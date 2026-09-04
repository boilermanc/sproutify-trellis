import { supabase } from '../lib/supabase';
import { Segment } from '../segmentTypes';

type SharedSegmentKind = 'rules' | 'link_interest' | 'campaign_engagement';

interface AudienceSegmentRow {
  id: string;
  name: string;
  description: string | null;
  kind: SharedSegmentKind;
  rule_groups: Segment['rule_groups'];
  link_interest: Segment['link_interest'] | null;
  campaign_engagement: Segment['campaign_engagement'] | null;
  recommended_branches: string[];
  icon: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

const fromRow = (row: AudienceSegmentRow): Segment => ({
  id: row.id,
  name: row.name,
  description: row.description || undefined,
  kind: row.kind,
  rule_groups: row.rule_groups || [],
  link_interest: row.link_interest || undefined,
  campaign_engagement: row.campaign_engagement || undefined,
  recommended_branches: row.recommended_branches || [],
  icon: row.icon || undefined,
  color: row.color || undefined,
  created_at: row.created_at,
  updated_at: row.updated_at,
  is_shared: true,
});

export async function fetchSharedSegments(): Promise<Segment[]> {
  const { data, error } = await supabase
    .from('audience_segments')
    .select('id,name,description,kind,rule_groups,link_interest,campaign_engagement,recommended_branches,icon,color,created_at,updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data || []) as AudienceSegmentRow[]).map(fromRow);
}

export async function saveSharedSegment(segment: Segment): Promise<Segment> {
  if (segment.kind === 'email_list') throw new Error('Test email lists must remain local');
  const kind = (segment.kind || 'rules') as SharedSegmentKind;
  const { data, error } = await supabase
    .from('audience_segments')
    .upsert({
      id: segment.id,
      name: segment.name,
      description: segment.description || null,
      kind,
      rule_groups: segment.rule_groups || [],
      link_interest: segment.link_interest || null,
      campaign_engagement: segment.campaign_engagement || null,
      recommended_branches: segment.recommended_branches || [],
      icon: segment.icon || null,
      color: segment.color || null,
      updated_at: new Date().toISOString(),
    })
    .select('id,name,description,kind,rule_groups,link_interest,campaign_engagement,recommended_branches,icon,color,created_at,updated_at')
    .single();
  if (error) throw error;
  return fromRow(data as AudienceSegmentRow);
}

export async function deleteSharedSegment(segmentId: string): Promise<void> {
  const { error } = await supabase.from('audience_segments').delete().eq('id', segmentId);
  if (error) throw error;
}
