import React, {useEffect,useRef,useState} from 'react';
import {Mail,RefreshCw} from 'lucide-react';
import {fetchSweetwaterInquiries,saveSweetwaterFollowUp,InquiryStatus,SweetwaterInquiry} from '../services/sweetwaterInquiryService';

const dateLabel = (value:string) => new Date(value).toLocaleString();
const control = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-2 focus:outline-emerald-600';

const InquiryDetail: React.FC<{inquiry:SweetwaterInquiry;onSaved:(row:SweetwaterInquiry)=>void;onDirtyChange:(dirty:boolean)=>void}> = ({inquiry,onSaved,onDirtyChange}) => {
  const [status,setStatus]=useState(inquiry.status);
  const [notes,setNotes]=useState(inquiry.notes);
  const [pending,setPending]=useState(false);
  const [message,setMessage]=useState('');
  const lock=useRef(false);
  useEffect(()=>{onDirtyChange(status!==inquiry.status || notes!==inquiry.notes);},[status,notes,inquiry.status,inquiry.notes,onDirtyChange]);
  async function save(event:React.FormEvent) {
    event.preventDefault();
    if(lock.current)return;
    lock.current=true;setPending(true);setMessage('');
    try { const row=await saveSweetwaterFollowUp(inquiry,status,notes);onSaved(row);setMessage('Follow-up saved.'); }
    catch(error){setMessage(error instanceof Error?error.message:'Could not save follow-up.');}
    finally{lock.current=false;setPending(false);}
  }
  return <article className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-7">
    <header><p className="text-sm text-slate-600">{inquiry.is_test?'TEST INQUIRY · ':''}{inquiry.intent} · {dateLabel(inquiry.created_at)}</p><h2 className="mt-2 text-2xl font-bold">{inquiry.name}</h2></header>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="font-bold">Preferred contact</dt><dd>{inquiry.contact_method==='callback'?'Phone callback':'Email'}</dd></div>
      <div><dt className="font-bold">Entry page / source</dt><dd className="break-words">{inquiry.entry_page} / {inquiry.source}</dd></div>
      <div><dt className="font-bold">Email</dt><dd className="break-words">{inquiry.email || 'Not provided'}</dd></div>
      <div><dt className="font-bold">Phone</dt><dd>{inquiry.phone || 'Not provided'}</dd></div>
    </dl>
    <section><h3 className="font-bold">Inquiry summary</h3><dl className="mt-3 space-y-3">{Object.entries(inquiry.context).map(([key,value])=><div key={key}><dt className="text-sm font-semibold capitalize">{key.replace(/([A-Z])/g,' $1')}</dt><dd className="whitespace-pre-wrap break-words text-sm text-slate-700">{value || 'Not provided'}</dd></div>)}</dl></section>
    <section className="rounded-xl bg-slate-50 p-4 text-sm"><h3 className="font-bold">Email alert to clint@sweetwater.technology</h3><p className="mt-2">{inquiry.notification_status==='sent'?'Accepted by email provider':inquiry.notification_status} · {inquiry.notification_attempts} attempt(s)</p>{inquiry.notified_at&&<p>{dateLabel(inquiry.notified_at)}</p>}{inquiry.notification_error&&<p role="status" className="mt-2 text-red-700">{inquiry.notification_error}</p>}<p className="mt-2 text-slate-600">Provider acceptance does not confirm inbox delivery. This inquiry remains here even if the alert fails.</p></section>
    <p className="text-sm text-slate-700">Marketing consent: {inquiry.consent.marketing?'Yes':'No'}. {inquiry.consent.eventFollowUp?'Event follow-up requested. Interest is not an RSVP or reserved seat.':'Contact requested; no appointment booked.'}</p>
    <details><summary className="cursor-pointer font-bold">Conversation ({inquiry.messages.length} messages)</summary><div className="mt-3 space-y-3">{inquiry.messages.map((turn,index)=><p key={index} className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm"><strong>{turn.role==='user'?'Visitor':'Sage'}: </strong>{turn.content}</p>)}{!inquiry.messages.length&&<p className="mt-2 text-sm">No chat transcript was submitted.</p>}</div></details>
    <form onSubmit={save}><fieldset disabled={pending} className="space-y-4"><label className="block text-sm font-bold">Follow-up status<select className={`${control} mt-2 block w-full`} value={status} onChange={event=>setStatus(event.target.value as InquiryStatus)}><option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option></select></label><label className="block text-sm font-bold">Internal notes<textarea className={`${control} mt-2 block w-full`} rows={4} maxLength={5000} value={notes} onChange={event=>setNotes(event.target.value)}/></label><button className="min-h-11 rounded-xl bg-emerald-700 px-5 py-2 font-bold text-white">{pending?'Saving...':'Save follow-up'}</button></fieldset>{message&&<p role="status" className="mt-3 text-sm">{message}</p>}</form>
    <p className="break-all text-xs text-slate-500">Request: {inquiry.request_id}</p>
  </article>;
};

export default function SweetwaterLeads({onDirtyChange}:{onDirtyChange?:(dirty:boolean)=>void}) {
  const dirty=useRef(false);
  const markDirty=React.useCallback((value:boolean)=>{dirty.current=value;onDirtyChange?.(value);},[onDirtyChange]);
  const leave=()=>{if(dirty.current && !window.confirm('Discard unsaved follow-up changes?'))return false;markDirty(false);return true;};
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>{window.removeEventListener('beforeunload',guard);onDirtyChange?.(false);};},[onDirtyChange]);
  const [rows,setRows]=useState<SweetwaterInquiry[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [status,setStatus]=useState('all');
  const [showTests,setShowTests]=useState(false);
  const [page,setPage]=useState(0);
  const [count,setCount]=useState(0);
  const [refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    let live=true;setLoading(true);setError('');
    fetchSweetwaterInquiries(page,status,showTests).then(result=>{if(live){setRows(result.rows);setCount(result.count);}}).catch(reason=>{if(live){setRows([]);setError(reason instanceof Error?reason.message:'Could not load inquiries.');}}).finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[page,status,showTests,refresh]);
  const inquiry=rows.find(row=>row.id===selected);
  return <div className="space-y-6 p-4 sm:p-8">
    <header><h1 className="flex items-center gap-3 text-3xl font-bold"><Mail aria-hidden="true"/>Sweetwater Leads</h1><p className="mt-3 max-w-3xl text-sm text-slate-600">Business AI, app ideas and greenhouse event interest. Saved inquiries and alert history stay here, separate from farm customers. No marketing is sent from this page.</p></header>
    <div className="flex flex-wrap items-center gap-4"><label className="text-sm font-bold">Status <select value={status} className={control} onChange={event=>{if(!leave())return;setStatus(event.target.value);setPage(0);setSelected(null);}}><option value="all">All</option><option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option></select></label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showTests} onChange={event=>{if(!leave())return;setShowTests(event.target.checked);setPage(0);setSelected(null);}}/>Include test inquiries</label><button disabled={loading} onClick={()=>{if(leave())setRefresh(value=>value+1);}} className={`${control} inline-flex min-h-11 items-center gap-2`}><RefreshCw size={16}/>Refresh</button></div>
    {error?<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>:loading?<p role="status">Loading inquiries...</p>:<>
      <p className="text-sm">{count} inquiry/inquiries · Page {page+1} of {Math.max(1,Math.ceil(count/25))}</p>
      <div className="grid gap-6 xl:grid-cols-[minmax(260px,1fr)_2fr]"><div className="space-y-3">{rows.map(row=><button key={row.id} onClick={()=>{if(leave())setSelected(row.id);}} aria-pressed={row.id===selected} className={`block w-full rounded-xl border p-4 text-left ${row.id===selected?'border-emerald-600 bg-emerald-50':'border-slate-200 bg-white'}`}><span className="block font-bold text-slate-900">{row.is_test?'TEST · ':''}{row.name}</span><span className="mt-1 block text-sm text-slate-600">{row.intent} · {row.status}</span><span className="block text-xs text-slate-600">{dateLabel(row.created_at)} · Alert: {row.notification_status}</span></button>)}{!rows.length&&<p>No inquiries match these filters.</p>}</div><div>{inquiry?<InquiryDetail key={inquiry.id} inquiry={inquiry} onDirtyChange={markDirty} onSaved={saved=>setRows(current=>current.map(row=>row.id===saved.id?saved:row))}/>:<p className="rounded-xl border border-dashed border-slate-300 p-6 text-slate-600">Select an inquiry to review details and follow-up.</p>}</div></div>
      <nav aria-label="Inquiry pages" className="flex gap-3"><button className={control} disabled={page===0} onClick={()=>{if(!leave())return;setPage(value=>value-1);setSelected(null);}}>Previous</button><button className={control} disabled={(page+1)*25>=count} onClick={()=>{if(!leave())return;setPage(value=>value+1);setSelected(null);}}>Next</button></nav>
    </>}
  </div>;
}
