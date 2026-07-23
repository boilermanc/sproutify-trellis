import React, { useEffect, useMemo, useState } from 'react';
import {
  Mail, MailCheck, Eye, MousePointerClick, MailX, AlertTriangle,
  Clock, Loader2, ShieldOff, Activity,
} from 'lucide-react';
import {
  fetchEmailActivity, fetchSuppressionForEmail,
  EmailEventRow, EmailSuppressionStatus,
} from '../services/emailReportingService';

// Per-contact email engagement history, keyed by email (federated identity key).
// Reads Hub tables only (email_events / email_suppressions) — never touches spoke data.

const EVENT_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  sent: { label: 'Sent', icon: Mail, color: 'text-slate-500', bg: 'bg-slate-100' },
  delivered: { label: 'Delivered', icon: MailCheck, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  opened: { label: 'Opened', icon: Eye, color: 'text-blue-600', bg: 'bg-blue-100' },
  clicked: { label: 'Clicked', icon: MousePointerClick, color: 'text-violet-600', bg: 'bg-violet-100' },
  bounced: { label: 'Bounced', icon: MailX, color: 'text-red-600', bg: 'bg-red-100' },
  complained: { label: 'Complained', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100' },
  delivery_delayed: { label: 'Delayed', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100' },
  failed: { label: 'Failed', icon: MailX, color: 'text-red-600', bg: 'bg-red-100' },
};

const fmtWhen = (iso: string): string => {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
};

interface Props {
  email: string;
}

export const EmailActivitySection: React.FC<Props> = ({ email }) => {
  const [events, setEvents] = useState<EmailEventRow[]>([]);
  const [suppression, setSuppression] = useState<EmailSuppressionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchEmailActivity(email), fetchSuppressionForEmail(email)])
      .then(([ev, sup]) => {
        if (cancelled) return;
        setEvents(ev);
        setSuppression(sup);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [email]);

  const counts = useMemo(() => {
    const c = { delivered: 0, opened: 0, clicked: 0, bounced: 0 };
    for (const e of events) {
      if (e.event_type === 'delivered') c.delivered++;
      else if (e.event_type === 'opened') c.opened++;
      else if (e.event_type === 'clicked') c.clicked++;
      else if (e.event_type === 'bounced') c.bounced++;
    }
    return c;
  }, [events]);

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
        <Activity className="w-4 h-4 text-emerald-600" />
        Email Activity
      </h3>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading history…
        </div>
      ) : (
        <>
          {/* Suppression banner */}
          {suppression?.suppressed && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <ShieldOff className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-xs font-semibold text-red-700">
                Suppressed{suppression.reason ? ` — ${suppression.reason}` : ''}. This address won't receive campaigns.
              </span>
            </div>
          )}

          {events.length === 0 ? (
            <p className="text-sm text-gray-400 py-1">
              No email activity yet. Events appear here after this contact is sent a campaign.
            </p>
          ) : (
            <>
              {/* Summary chips */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Delivered', value: counts.delivered, color: 'text-emerald-600' },
                  { label: 'Opened', value: counts.opened, color: 'text-blue-600' },
                  { label: 'Clicked', value: counts.clicked, color: 'text-violet-600' },
                  { label: 'Bounced', value: counts.bounced, color: 'text-red-600' },
                ].map((s) => (
                  <div key={s.label} className="bg-white rounded-lg border border-gray-100 px-2 py-2 text-center">
                    <div className={`text-lg font-black ${s.color}`}>{s.value}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {events.map((e) => {
                  const meta = EVENT_META[e.event_type] || { label: e.event_type, icon: Mail, color: 'text-gray-500', bg: 'bg-gray-100' };
                  const Icon = meta.icon;
                  return (
                    <div key={e.id} className="flex items-start gap-3 bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
                        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold ${meta.color}`}>{meta.label}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">{fmtWhen(e.occurred_at)}</span>
                        </div>
                        {e.campaign_subject && (
                          <p className="text-[11px] text-gray-500 truncate mt-0.5">{e.campaign_subject}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 text-center pt-1">
                Live from Resend delivery events · newest first
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default EmailActivitySection;
