
import React, { useState, useMemo, useEffect } from 'react';
import { Profile } from '../types';
import { createCampaign, fetchCampaigns, Campaign } from '../supabaseService';
import { Segment, PRESET_SEGMENTS, SEGMENT_FIELDS } from '../segmentTypes';
import { filterProfilesBySegment, countProfilesInSegment } from '../segmentEngine';
import { loadNameCache } from '../demographicsService';
import {
  Users, Mail, Calendar, Rocket, ChevronRight,
  ChevronLeft, CheckCircle2, Search, Target,
  Layout, Send, Zap, Eye, Smartphone, Clock, History,
  FileText, Sparkles, Megaphone, RefreshCw,
  Info, ShieldCheck, Activity, BarChart3, ArrowRight
} from 'lucide-react';

interface CampaignBuilderProps {
  onCampaignLaunch: (campaign: { name: string, audienceSize: number, segments: string[] }) => void;
  profiles: Profile[];
}

const STEPS = [
  { id: 'identify', title: 'Identify', icon: Users, desc: 'Segment Ecosystem' },
  { id: 'compose', title: 'Compose', icon: Layout, desc: 'Design Strategy' },
  { id: 'schedule', title: 'Schedule', icon: Calendar, desc: 'Timing Logic' },
  { id: 'deploy', title: 'Deploy', icon: Rocket, desc: 'Review & Launch' },
];

const STRATEGIC_DIRECTIONS = [
  { step: 0, title: "Audience Resolution", advice: "Identify high-intent profiles by cross-referencing tags across spokes. Targeting 'Urban Gardeners' from both Farm and Rejoice spokes often yields 3x conversion.", kpi: "Projected Reach: High" },
  { step: 1, title: "Payload Composition", advice: "Sage suggests using the 'Unified Sproutify' template for cross-site updates. Dynamic modules will automatically adjust based on the user's primary spoke site.", kpi: "Est. CTR: 12.4%" },
  { step: 2, title: "Deployment Sync", advice: "Synchronized releases ensure your brand message is consistent across all 5 spokes simultaneously. Choose 'Immediate' for urgent flash sales.", kpi: "Load Balance: Optimized" },
  { step: 3, title: "Global Orchestration", advice: "Final validation of all identity resolution tokens and template variables. Once launched, the Resend gateway will handle distribution automatically.", kpi: "Status: Validated" }
];

const TEMPLATES = [
  { id: 'UnifiedSproutifyUpdate', name: 'Unified Sproutify Update', icon: Layout, desc: 'Full-featured dynamic newsletter with smart blocks.', color: 'emerald' },
  { id: 'SimpleNewsletter', name: 'Minimal Announcement', icon: FileText, desc: 'Clean, text-focused template for quick updates.', color: 'blue' },
  { id: 'FlashSale', name: 'Promotional Alert', icon: Megaphone, desc: 'High-contrast CTA focus for product launches.', color: 'rose' },
];

const CampaignBuilder: React.FC<CampaignBuilderProps> = ({ onCampaignLaunch, profiles }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [campaignData, setCampaignData] = useState({
    name: '',
    segments: [] as string[],
    tags: [] as string[],
    subject: '',
    template: 'UnifiedSproutifyUpdate',
    trigger: 'immediate',
  });
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);
  const [deployedCampaigns, setDeployedCampaigns] = useState<any[]>([]);
  
  const [testEmailAddress, setTestEmailAddress] = useState('marketing@sproutify.me');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSentStatus, setTestSentStatus] = useState<null | 'success'>(null);
  const [savedCampaigns, setSavedCampaigns] = useState<Campaign[]>([]);
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('09:00');
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [customSegments, setCustomSegments] = useState<Segment[]>(() => {
    const saved = localStorage.getItem('trellis_custom_segments');
    return saved ? JSON.parse(saved) : [];
  });

  // Load existing campaigns on mount
  useEffect(() => {
    const loadCampaigns = async () => {
      const campaigns = await fetchCampaigns();
      setSavedCampaigns(campaigns);
    };
    loadCampaigns();
  }, []);

  // Load demographics cache on mount
  useEffect(() => {
    loadNameCache();
  }, []);

  const availableSegments: string[] = Array.from(new Set(profiles.flatMap(p => p.segments)));
  const availableTags: string[] = Array.from(new Set(profiles.flatMap(p => p.tags)));

  const audienceSize = useMemo(() => {
    if (campaignData.segments.length === 0 && campaignData.tags.length === 0) return 0;
    return profiles.filter(p =>
      (campaignData.segments.length === 0 || p.segments.some(s => campaignData.segments.includes(s))) &&
      (campaignData.tags.length === 0 || p.tags.some(t => campaignData.tags.includes(t)))
    ).length;
  }, [campaignData.segments, campaignData.tags, profiles]);

  const allSegments = useMemo(() => {
    const presets: Segment[] = PRESET_SEGMENTS.map((preset, index) => ({
      ...preset,
      id: `preset-${index}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    return [...presets, ...customSegments];
  }, [customSegments]);

  const segmentProfiles = useMemo(() => {
    if (!selectedSegment) return profiles;
    return filterProfilesBySegment(profiles, selectedSegment);
  }, [profiles, selectedSegment]);

  const injectVariable = (variable: string) => {
    setCampaignData(prev => ({ ...prev, subject: prev.subject + ` {{${variable}}}` }));
  };

  const handleSendTest = () => {
    if (!testEmailAddress) return;
    setIsSendingTest(true);
    setTimeout(() => {
      setIsSendingTest(false);
      setTestSentStatus('success');
      setTimeout(() => setTestSentStatus(null), 3000);
    }, 1500);
  };

  const handleLaunch = async () => {
    setIsLaunching(true);

    // Save campaign to Supabase
    const launchedAt = new Date().toISOString();
    const scheduledAt = campaignData.trigger === 'scheduled' && scheduledDate
      ? new Date(scheduledDate + 'T' + scheduledTime).toISOString()
      : null;

    const newCampaign = await createCampaign({
      name: campaignData.name,
      status: campaignData.trigger === 'scheduled' ? 'scheduled' : 'active',
      template: campaignData.template,
      subject: campaignData.subject,
      trigger_type: campaignData.trigger === 'immediate' ? 'immediate' : campaignData.trigger === 'scheduled' ? 'scheduled' : 'event_based',
      scheduled_at: scheduledAt,
      segments: campaignData.segments,
      tags: campaignData.tags,
      branches: [],
      audience_size: selectedSegment ? segmentProfiles.length : audienceSize,
      metadata: {
        segment_id: selectedSegment?.id || null,
        segment_name: selectedSegment?.name || 'All Profiles',
        recipient_count: segmentProfiles.length,
        recipients: segmentProfiles.slice(0, 100).map(p => ({ email: p.email, first_name: p.first_name })),
      },
      created_by: 'system',
      launched_at: campaignData.trigger === 'immediate' ? launchedAt : null,
    });

    if (newCampaign) {
      setSavedCampaigns(prev => [newCampaign, ...prev]);
    } else {
      console.error('Failed to save campaign to Supabase');
    }

    let progress = 0;
    const interval = setInterval(() => {
      progress += 2;
      setLaunchProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);

        onCampaignLaunch({
          name: campaignData.name,
          audienceSize: selectedSegment ? segmentProfiles.length : audienceSize,
          segments: campaignData.segments
        });

        // Use functional update to prevent race conditions during state reset
        setDeployedCampaigns(prev => [{
          name: campaignData.name,
          date: new Date().toISOString(),
          reach: selectedSegment ? segmentProfiles.length : audienceSize
        }, ...prev]);

        setTimeout(() => {
          setIsLaunching(false);
          setLaunchProgress(0);
          setCurrentStep(0);
          setCampaignData({
            name: '',
            segments: [],
            tags: [],
            subject: '',
            template: 'UnifiedSproutifyUpdate',
            trigger: 'immediate',
          });
          setScheduledDate('');
          setScheduledTime('09:00');
          setSelectedSegment(null);
        }, 500);
      }
    }, 50);

    return () => clearInterval(interval);
  };

  const currentStrategicAdvice = STRATEGIC_DIRECTIONS[currentStep];

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Campaign Master ID</label>
              <input 
                type="text" 
                placeholder="e.g. FALL_2024_RECOVERY_PHASE_1"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-xl font-black uppercase tracking-tight focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
                value={campaignData.name}
                onChange={e => setCampaignData(prev => ({...prev, name: e.target.value}))}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-6 flex items-center">
                  <Target size={18} className="mr-3 text-indigo-500" />
                  Global Segments
                </h4>
                <div className="flex flex-wrap gap-2">
                  {availableSegments.map(seg => (
                    <button
                      type="button"
                      key={seg}
                      onClick={() => setCampaignData(prev => ({
                        ...prev,
                        segments: prev.segments.includes(seg)
                          ? prev.segments.filter(s => s !== seg)
                          : [...prev.segments, seg]
                      }))}
                      className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                        campaignData.segments.includes(seg)
                        ? 'bg-slate-900 border-slate-900 text-white shadow-lg scale-105'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {seg.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-6 flex items-center">
                  <Zap size={18} className="mr-3 text-amber-500" />
                  Interest Matrix
                </h4>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map(tag => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => setCampaignData(prev => ({
                        ...prev,
                        tags: prev.tags.includes(tag)
                          ? prev.tags.filter(t => t !== tag)
                          : [...prev.tags, tag]
                      }))}
                      className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                        campaignData.tags.includes(tag)
                        ? 'bg-amber-500 border-amber-500 text-white shadow-lg scale-105'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-amber-300'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Audience Selection */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-400" />
                Target Audience
              </h3>

              <div className="space-y-4">
                {/* Segment Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Segment
                  </label>
                  <select
                    value={selectedSegment?.id || ''}
                    onChange={(e) => {
                      const segment = allSegments.find(s => s.id === e.target.value);
                      setSelectedSegment(segment || null);
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="">All Profiles ({profiles.length})</option>
                    <optgroup label="Preset Segments">
                      {allSegments.filter(s => s.is_preset).map(segment => (
                        <option key={segment.id} value={segment.id}>
                          {segment.name} ({countProfilesInSegment(profiles, segment)})
                        </option>
                      ))}
                    </optgroup>
                    {customSegments.length > 0 && (
                      <optgroup label="Custom Segments">
                        {customSegments.map(segment => (
                          <option key={segment.id} value={segment.id}>
                            {segment.name} ({countProfilesInSegment(profiles, segment)})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {/* Segment Info */}
                {selectedSegment && (
                  <div className="p-4 bg-emerald-50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-emerald-800">{selectedSegment.name}</span>
                      <span className="text-2xl font-bold text-emerald-700">
                        {segmentProfiles.length}
                      </span>
                    </div>
                    {selectedSegment.description && (
                      <p className="text-sm text-emerald-600 mb-2">{selectedSegment.description}</p>
                    )}
                    <p className="text-xs text-emerald-500">
                      {selectedSegment.rule_groups[0]?.rules.map(rule => {
                        const field = SEGMENT_FIELDS.find(f => f.id === rule.field);
                        return `${field?.label || rule.field} ${rule.operator} ${rule.value}`;
                      }).join(' AND ')}
                    </p>
                  </div>
                )}

                {/* Recipients Preview */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Recipients Preview</span>
                    <span className="text-sm text-gray-500">{segmentProfiles.length} profiles</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-xl">
                    {segmentProfiles.slice(0, 10).map((profile, idx) => (
                      <div
                        key={profile.id || profile.email || idx}
                        className="flex items-center justify-between px-3 py-2 border-b border-gray-50 last:border-0"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {profile.first_name} {profile.last_name}
                          </p>
                          <p className="text-xs text-gray-500">{profile.email}</p>
                        </div>
                        {profile.order_stats && (
                          <span className="text-xs text-emerald-600 font-medium">
                            ${profile.order_stats.ltv.toFixed(0)}
                          </span>
                        )}
                      </div>
                    ))}
                    {segmentProfiles.length > 10 && (
                      <div className="px-3 py-2 text-center text-xs text-gray-500 bg-gray-50">
                        +{segmentProfiles.length - 10} more recipients
                      </div>
                    )}
                    {segmentProfiles.length === 0 && (
                      <div className="px-3 py-6 text-center text-sm text-gray-500">
                        No profiles match this segment
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className={`p-8 rounded-[2.5rem] border-4 transition-all duration-500 flex items-center justify-between ${
              audienceSize > 0 ? 'bg-emerald-50 border-emerald-500/10' : 'bg-slate-50 border-slate-100'
            }`}>
              <div className="flex items-center space-x-6">
                <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-lg ${audienceSize > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-white'}`}>
                  <Users size={32} />
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Strategy Reach</p>
                  <p className="text-3xl font-black text-slate-800">{audienceSize} Synced Identities</p>
                </div>
              </div>
              {audienceSize > 0 && <span className="text-[10px] font-black text-emerald-600 bg-emerald-100 px-4 py-1 rounded-full uppercase">Target Ready</span>}
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-6">
              <div className="flex justify-between items-end">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Dispatch Subject</label>
                <div className="flex items-center space-x-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 uppercase tracking-widest">
                  <Sparkles size={12} />
                  <span>AI Optimization On</span>
                </div>
              </div>
              <input 
                type="text" 
                placeholder="e.g. A specialized update for you, {{first_name}}!"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 text-xl font-bold focus:bg-white focus:border-emerald-500 outline-none transition shadow-inner"
                value={campaignData.subject}
                onChange={e => setCampaignData(prev => ({...prev, subject: e.target.value}))}
              />
              <div className="flex items-center space-x-3">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Token Injection:</span>
                <div className="flex gap-2">
                  {['first_name', 'email', 'tags'].map(v => (
                    <button 
                      key={v}
                      onClick={() => injectVariable(v)}
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-slate-600 hover:border-emerald-500 transition-all uppercase tracking-tighter"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Payload Strategy</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {TEMPLATES.map(tmpl => (
                  <button 
                    key={tmpl.id}
                    onClick={() => setCampaignData(prev => ({...prev, template: tmpl.id}))}
                    className={`group relative text-left p-8 rounded-[2.5rem] border-4 transition-all duration-300 ${
                      campaignData.template === tmpl.id 
                      ? 'border-emerald-500 bg-emerald-50/50 shadow-2xl scale-105' 
                      : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 transition-transform group-hover:rotate-6 ${
                      campaignData.template === tmpl.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400 shadow-inner'
                    }`}>
                      <tmpl.icon size={28} />
                    </div>
                    <h5 className="font-black text-slate-800 text-sm mb-2 uppercase tracking-tight">{tmpl.name}</h5>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">{tmpl.desc}</p>
                    {campaignData.template === tmpl.id && (
                      <div className="absolute top-6 right-6 text-emerald-600">
                        <CheckCircle2 size={24} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { id: 'immediate', title: 'Send Now', desc: 'Deploy immediately after launch', icon: Send },
                { id: 'scheduled', title: 'Schedule', desc: 'Choose a specific date and time', icon: Calendar },
              ].map(opt => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setCampaignData(prev => ({...prev, trigger: opt.id}))}
                  className={`p-8 rounded-[2.5rem] border-4 text-left transition-all ${
                    campaignData.trigger === opt.id ? 'border-emerald-500 bg-emerald-50 shadow-xl scale-[1.02]' : 'border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${
                    campaignData.trigger === opt.id ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <opt.icon size={24} />
                  </div>
                  <h5 className="font-black text-slate-800 uppercase tracking-tight text-base">{opt.title}</h5>
                  <p className="text-[11px] text-slate-500 mt-2 font-medium italic">{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* Date/Time Picker for Scheduled Delivery */}
            {campaignData.trigger === 'scheduled' && (
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-6 flex items-center">
                  <Calendar size={18} className="mr-3 text-amber-500" />
                  Schedule Deployment
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Date</label>
                    <input
                      type="date"
                      value={scheduledDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-5 py-4 text-base font-bold focus:bg-white focus:border-emerald-500 outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Time</label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-5 py-4 text-base font-bold focus:bg-white focus:border-emerald-500 outline-none transition"
                    />
                  </div>
                </div>
                {scheduledDate && (
                  <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-sm font-bold text-amber-800">
                      <Clock size={14} className="inline mr-2" />
                      Campaign will deploy on{' '}
                      <span className="font-black">
                        {new Date(scheduledDate + 'T' + scheduledTime).toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                      {' '}at{' '}
                      <span className="font-black">
                        {new Date(scheduledDate + 'T' + scheduledTime).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white rounded-[3rem] border-4 border-slate-100 overflow-hidden shadow-2xl">
              <div className="bg-slate-50 px-10 py-8 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Final Orchestration Audit</h4>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Status: Ready for Global Deployment</p>
                </div>
                <div className="flex items-center space-x-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full border border-emerald-200">
                  <ShieldCheck size={18} className="mr-1" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Validated</span>
                </div>
              </div>
              
              <div className="p-10 grid grid-cols-2 gap-x-12 gap-y-8 bg-white">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Master Dispatch ID</p>
                  <p className="font-black text-slate-800 text-lg uppercase tracking-tight">{campaignData.name || 'UNTITLED_FLOW'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Audience Resolution</p>
                  <p className="font-black text-emerald-600 text-lg uppercase tracking-tight">{audienceSize} Verified Profiles</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Template</p>
                  <p className="font-black text-slate-800 text-base">
                    {TEMPLATES.find(t => t.id === campaignData.template)?.name || campaignData.template}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Delivery Method</p>
                  <p className="font-black text-slate-800 text-base flex items-center">
                    {campaignData.trigger === 'immediate' && <><Send size={16} className="mr-2 text-emerald-600" />Send Now</>}
                    {campaignData.trigger === 'scheduled' && <><Calendar size={16} className="mr-2 text-amber-600" />Scheduled</>}
                  </p>
                </div>
                {campaignData.trigger === 'scheduled' && scheduledDate && (
                  <div className="col-span-2 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Scheduled For</p>
                    <p className="font-black text-amber-800 text-lg">
                      {new Date(scheduledDate + 'T' + scheduledTime).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })} at {new Date(scheduledDate + 'T' + scheduledTime).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </p>
                  </div>
                )}
                {(campaignData.segments.length > 0 || campaignData.tags.length > 0) && (
                  <div className="col-span-2 pt-6 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-6">
                      {campaignData.segments.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Target Segments</p>
                          <div className="flex flex-wrap gap-2">
                            {campaignData.segments.map(seg => (
                              <span key={seg} className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase">
                                {seg.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {campaignData.tags.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Interest Tags</p>
                          <div className="flex flex-wrap gap-2">
                            {campaignData.tags.map(tag => (
                              <span key={tag} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-[10px] font-black uppercase">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="col-span-2 pt-6 border-t border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Subject Line</p>
                  <p className="font-black text-slate-800 text-xl italic leading-tight">"{campaignData.subject || 'No subject set'}"</p>
                </div>

                <div className="col-span-2 pt-10 mt-6 border-t border-slate-100 bg-slate-50/50 -mx-10 p-10">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                       <Mail size={24} className="text-indigo-600" />
                       <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Staging Proofing Center</h5>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <input 
                      type="email" 
                      className="flex-1 bg-white border-2 border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold focus:border-indigo-500 outline-none transition shadow-inner"
                      placeholder="marketing@sproutify.app"
                      value={testEmailAddress}
                      onChange={e => setTestEmailAddress(e.target.value)}
                    />
                    <button 
                      onClick={handleSendTest}
                      disabled={isSendingTest || !testEmailAddress}
                      className={`px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center space-x-3 shadow-xl ${
                        testSentStatus === 'success' 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {isSendingTest ? (
                        <RefreshCw size={18} className="animate-spin" />
                      ) : testSentStatus === 'success' ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <Send size={18} />
                      )}
                      <span>{isSendingTest ? 'Deploying Proof...' : testSentStatus === 'success' ? 'Proof Dispatched' : 'Send Staging Proof'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Campaigns Section */}
            {savedCampaigns.length > 0 && (
              <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex items-center space-x-3">
                  <History size={20} className="text-slate-500" />
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Recent Campaigns</h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {savedCampaigns.slice(0, 5).map((campaign) => (
                    <div key={campaign.id} className="px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition">
                      <div className="flex-1">
                        <p className="font-black text-slate-800 text-sm uppercase tracking-tight">{campaign.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium mt-1">
                          {campaign.launched_at ? new Date(campaign.launched_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : 'Not launched'}
                        </p>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-xs font-black text-emerald-600">{campaign.audience_size}</p>
                          <p className="text-[9px] text-slate-400 uppercase tracking-widest">Reach</p>
                        </div>
                        <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                          campaign.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                          campaign.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                          campaign.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {campaign.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 pb-20">
      <div className="lg:col-span-3 space-y-12">
        <div className="flex justify-between items-start relative px-4">
          <div className="absolute top-6 left-10 right-10 h-1 bg-slate-100 -z-10 rounded-full">
             <div className="h-full bg-emerald-500 transition-all duration-700 rounded-full" style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}></div>
          </div>
          {STEPS.map((step, idx) => {
            const isActive = idx === currentStep;
            const isCompleted = idx < currentStep;
            const canNavigate = !isLaunching && (
              idx <= currentStep || // Can always go back
              (idx === 1 && campaignData.name) || // Can go to step 1 if name filled
              (idx === 2 && campaignData.name && campaignData.subject) || // Can go to step 2 if name and subject filled
              (idx === 3 && campaignData.name && campaignData.subject && (campaignData.trigger !== 'scheduled' || scheduledDate)) // Can go to step 3 if all required fields
            );
            return (
              <div key={step.id} className={`flex flex-col items-center group ${canNavigate ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`} onClick={() => canNavigate && setCurrentStep(idx)}>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 border-4 shadow-xl ${
                  isActive ? 'bg-slate-900 text-white border-emerald-500 scale-110' : 
                  isCompleted ? 'bg-emerald-600 text-white border-white' : 
                  'bg-white text-slate-300 border-slate-100'
                }`}>
                  {isCompleted ? <CheckCircle2 size={24} /> : <step.icon size={24} />}
                </div>
                <div className="mt-4 text-center">
                  <p className={`text-[9px] font-black uppercase tracking-[0.2em] transition-colors ${isActive ? 'text-slate-900' : 'text-slate-400'}`}>{step.title}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="min-h-[500px]">
          {renderStep()}
        </div>

        <div className="flex justify-between items-center pt-10 border-t border-slate-200">
          <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0 || isLaunching} className="px-8 py-4 flex items-center space-x-3 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-slate-800 transition disabled:opacity-0 group">
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span>Previous Step</span>
          </button>
          
          {currentStep === STEPS.length - 1 ? (
            <button 
              onClick={handleLaunch}
              disabled={isLaunching || audienceSize === 0 || !campaignData.name || !campaignData.subject}
              className="px-12 py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-slate-900/40 hover:bg-emerald-600 transition disabled:opacity-50 flex items-center space-x-4"
            >
              <Rocket size={24} className="text-emerald-400" />
              <span>Launch Global Sync</span>
            </button>
          ) : (
            <button
              onClick={() => setCurrentStep(Math.min(STEPS.length - 1, currentStep + 1))}
              disabled={
                (currentStep === 0 && !campaignData.name) ||
                (currentStep === 1 && !campaignData.subject) ||
                (currentStep === 2 && campaignData.trigger === 'scheduled' && !scheduledDate)
              }
              className="px-10 py-5 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center space-x-3 shadow-xl hover:bg-emerald-700 transition disabled:opacity-50 group">
              <span>Continue Strategy</span>
              <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          )}
        </div>
      </div>

      <div className="lg:col-span-1 space-y-8">
         <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col min-h-[500px]">
            <div className="flex items-center space-x-3 mb-10 border-b border-slate-100 pb-10">
               <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm border border-indigo-100"><Info size={20} /></div>
               <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Sage Strategic Guidance</h3>
            </div>
            <div className="flex-1 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                     <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                     <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">{currentStrategicAdvice.title}</h4>
                  </div>
                  <p className="text-sm font-medium text-slate-600 leading-relaxed italic border-l-2 border-emerald-500 pl-4 py-1">
                    "{currentStrategicAdvice.advice}"
                  </p>
               </div>
               <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Confidence Score</span>
                     <span className="text-xs font-black text-emerald-600">94%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                     <div className="h-full bg-emerald-500 rounded-full" style={{ width: '94%' }}></div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight flex items-center"><BarChart3 size={12} className="mr-2" /> {currentStrategicAdvice.kpi}</p>
               </div>
            </div>
         </div>
      </div>

      {isLaunching && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[60] flex flex-col items-center justify-center text-white p-8 text-center animate-in fade-in duration-500">
          <div className="relative mb-12">
             <div className="absolute inset-0 bg-emerald-500 rounded-full blur-[120px] opacity-20 animate-pulse"></div>
             <Rocket size={80} className="text-emerald-400 animate-bounce relative z-10" />
          </div>
          <h2 className="text-5xl font-black mb-6 tracking-tighter uppercase italic">Deploying Strategic Orchestration...</h2>
          <div className="w-full max-w-xl bg-white/10 rounded-full h-4 overflow-hidden mb-8 border border-white/5 shadow-2xl">
            <div className="bg-emerald-500 h-full transition-all duration-300 relative" style={{ width: `${launchProgress}%` }}>
               <div className="absolute inset-0 bg-white/40 animate-pulse"></div>
            </div>
          </div>
          <div className="flex flex-col items-center space-y-4">
             <p className="text-sm font-black uppercase tracking-[0.4em] text-emerald-400 animate-pulse">{launchProgress}% Synchronized</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignBuilder;
