import React, {useState} from 'react';
import {supabase} from '../lib/supabase';
import {parseAdsManagerCsv} from '../services/adPerformanceService';

type Result = {ads:Record<string,{orders:number;buyers:number;unknown:number}>;unmatched:number};
type Row = {id:string;name:string;spend:number};
type Report = {campaign:string;period:string;rows:Row[];counts:Result};
const money = (n:number) => n.toLocaleString('en-US',{style:'currency',currency:'USD'});

export default function AtlAcquisition() {
  const [report,setReport] = useState<Report|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function read(file:File) {
    setBusy(true); setReport(null); setError('');
    try {
      if(file.size > 2_000_000) throw Error('Export one campaign, up to 500 ads.');
      const csv = await file.text();
      if(!/(?:^|,)\s*"?Amount spent \(USD\)"?\s*(?:,|$)/i.test(csv.split(/\r?\n/)[0].replace(/^\uFEFF/,''))) throw Error('Include Amount spent (USD) in your export.');
      const {rows,errors} = parseAdsManagerCsv(csv);
      if(errors.length || !rows.length || rows.length>500) throw Error(errors[0] || 'Export between 1 and 500 ads.');
      const {campaign_name,reporting_start:start,reporting_end:end} = rows[0];
      if(!campaign_name || !start || !end) throw Error('Include Campaign name, Reporting starts and Reporting ends.');
      const ads = rows.map(row => {
        if(row.campaign_name !== campaign_name || row.reporting_start !== start || row.reporting_end !== end) throw Error('Use one campaign and one reporting period for every ad.');
        if(!row.external_ad_id || !/^\d{1,30}$/.test(row.external_ad_id) || row.spend == null || row.spend < 0) throw Error('Every ad needs its full numeric Ad ID and a valid USD spend.');
        return {id:row.external_ad_id,name:row.ad_name || row.external_ad_id,spend:row.spend};
      });
      const ids = ads.map(ad=>ad.id);
      if(new Set(ids).size !== ids.length) throw Error('Export one row per ad with no breakdowns.');
      const {data,error:failure} = await supabase.functions.invoke<Result>('atl-acquisition',{body:{start,end,ids}});
      if(failure || !data) throw Error('Could not read ATL history. Check your administrator session and retry.');
      setReport({campaign:campaign_name,period:start+' through '+end,rows:ads,counts:data});
    } catch(e) { setError(e instanceof Error ? e.message : 'Unable to load report.'); }
    finally {setBusy(false);}
  }
  return <details className="rounded-2xl border border-emerald-200 bg-white p-5">
    <summary className="cursor-pointer font-bold text-emerald-800">ATL Urban Farms · Meta acquisition report</summary>
    <div className="mt-4 space-y-4 text-sm">
      <p>Compare Meta spend with first recorded ATL buyers. An active Trellis administrator can run this report.</p>
      <label className="block font-bold">ATL campaign export (USD, Eastern time)
        <input className="block mt-2 max-w-full" type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>{const f=e.target.files?.[0]; e.target.value=''; if(f) void read(f);}}/>
      </label>
      {busy && <p role="status">Reading ATL order history…</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {report && <section aria-label="Acquisition results"><h3 className="font-bold">{report.campaign}</h3><p>{report.period} · America/New_York</p>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Ad','Spend','Matched orders','First-time buyers','Unknown buyer','Cost per first-time buyer'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead>
        <tbody>{report.rows.map(row=>{const count=report.counts.ads[row.id];return <tr key={row.id}><th className="p-2">{row.name}<small className="block">{row.id}</small></th><td>{money(row.spend)}</td><td>{count.orders}</td><td>{count.buyers}</td><td>{count.unknown}</td><td>{count.buyers ? money(row.spend/count.buyers) : '—'}</td></tr>;})}</tbody></table></div>
        <p><strong>{report.counts.unmatched}</strong> other eligible ATL orders in this period had no matching ad ID. This includes other channels and campaigns.</p></section>}
      <details><summary className="cursor-pointer font-bold">Field guide · setup, interpretation and decisions</summary>
        <div className="mt-3 space-y-3">
        <h4 className="font-bold">1. Tag the destination</h4><p>In Ads Manager, add these URL parameters to each ATL ad. Preview the destination and verify the delivered URL contains numeric IDs. Keep names, emails and click identifiers out of the tags.</p>
        <code className="block break-all">utm_source=meta&amp;utm_medium=paid_social&amp;campaign_id={'{{campaign.id}}'}&amp;ad_id={'{{ad.id}}'}</code>
        <p>ATL keeps the last consented campaign touch in the session for up to 24 hours. Consent refusal, another device, a later visit or a redirect that drops tags can leave an order unmatched.</p>
        <h4 className="font-bold">2. Export the comparison</h4><p>Filter Ads Manager to one ATL campaign. Use Ads level, one closed Eastern-time date range, USD, and no breakdowns. Include Campaign name, Ad name, Ad ID, Amount spent (USD), Reporting starts and Reporting ends. Upload the original CSV to preserve long IDs. Export again when spend changes.</p>
        <h4 className="font-bold">3. Read each row</h4><p>Spend comes from the export. Matched orders are fully paid, uncancelled and unrefunded orders created in that period carrying the exact ad ID. First-time means the earliest qualifying order for a normalized customer or guest email across available ATL history. Unknown emails count as orders only. Refunds or corrections can change a later run.</p>
        <h4 className="font-bold">4. Make a decision</h4><p>Example: $120 spent and four first-time buyers gives $30 per acquired buyer. If the first order contributes $22 after variable costs, that leaves an $8 shortfall per buyer before overhead. Check your own margins, sample size and repeat purchases before increasing spend.</p>
        <p>A dash means there is no matched first-time buyer to divide by. With zero matches, check delivered links, consent, date range and ad IDs before judging the creative. With only one or two buyers, extend the comparison. With consistent results below your allowable cost, test a modest budget change and compare another closed period.</p>
        <p>Meta can credit views and later conversions under its own attribution window. This report counts observed checkout matches. A tagged purchase alone cannot establish that the ad caused the sale.</p>
        </div></details>
    </div></details>;
}
