import { supabase } from '../lib/supabase';

export type InquiryStatus = 'new' | 'contacted' | 'closed';
export interface SweetwaterInquiry {
  id: string;
  request_id: string;
  intent: string;
  source: string;
  entry_page: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_method: 'email' | 'callback';
  context: Record<string, string | null>;
  messages: Array<{role: string; content: string}>;
  consent: {marketing?: boolean; eventFollowUp?: boolean};
  is_test: boolean;
  status: InquiryStatus;
  notes: string;
  notification_status: 'pending' | 'sending' | 'sent' | 'failed';
  notification_attempts: number;
  notification_error: string | null;
  notification_message_id: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}
const fields = 'id,request_id,intent,source,entry_page,name,email,phone,contact_method,context,messages,consent,is_test,status,notes,notification_status,notification_attempts,notification_error,notification_message_id,notified_at,created_at,updated_at';
export async function fetchSweetwaterInquiries(page: number, status: string, showTests: boolean) {
  const {data: allowed, error: accessError} = await supabase.rpc('is_trellis_admin');
  if (accessError || !allowed) throw new Error('Sweetwater Leads requires an active Trellis owner or administrator account.');
  let query = supabase.from('sweetwater_inquiries').select(fields, {count:'exact'}).order('created_at',{ascending:false}).range(page*25,page*25+24);
  if (status !== 'all') query = query.eq('status',status);
  if (!showTests) query = query.eq('is_test',false);
  const {data,error,count} = await query;
  if (error) throw new Error('Could not load Sweetwater inquiries. Please retry.');
  return {rows:(data || []) as SweetwaterInquiry[],count:count || 0};
}
export async function saveSweetwaterFollowUp(inquiry: SweetwaterInquiry, status: InquiryStatus, notes: string) {
  const {data,error} = await supabase.from('sweetwater_inquiries')
    .update({status,notes:notes.trim(),updated_at:new Date().toISOString()})
    .eq('id',inquiry.id).eq('updated_at',inquiry.updated_at).select(fields).maybeSingle();
  if (error || !data) throw new Error('Could not save. This inquiry may have changed; refresh and review before retrying.');
  return data as SweetwaterInquiry;
}
