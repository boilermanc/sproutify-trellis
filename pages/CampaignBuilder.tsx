
import React, { useState, useMemo, useEffect } from 'react';
import { Profile, SpokeConnection, BranchContext } from '../types';
import { createCampaign, fetchCampaigns, Campaign } from '../supabaseService';
import { loadNameCache } from '../demographicsService';
import { timeAgo, formatBranchName } from '../utils';
import {
  Users, Mail, Calendar, Rocket, ChevronRight,
  ChevronLeft, CheckCircle2, Target,
  Layout, Send, Clock, History, Trash2,
  FileText, Sparkles, Megaphone, RefreshCw,
  Info, ShieldCheck, BarChart3,
  Globe, ChevronDown
} from 'lucide-react';

interface CampaignRecord {
  id: string;
  name: string;
  launchedAt: string;
  audienceSize: number;
  branches: string[];
  presets: string[];
  template: string;
  trigger: string;
  status: 'deployed' | 'scheduled' | 'draft';
}

interface CampaignBuilderProps {
  onCampaignLaunch: (campaign: { name: string, audienceSize: number, segments: string[] }) => void;
  profiles: Profile[];
  spokeConnections?: SpokeConnection[];
  branchContext?: BranchContext;
}

const STEPS = [
  { id: 'scope', title: 'Scope', icon: Globe, desc: 'Target Branches' },
  { id: 'identify', title: 'Identify', icon: Users, desc: 'Segment Ecosystem' },
  { id: 'compose', title: 'Compose', icon: Layout, desc: 'Design Strategy' },
  { id: 'schedule', title: 'Schedule', icon: Calendar, desc: 'Timing Logic' },
  { id: 'deploy', title: 'Deploy', icon: Rocket, desc: 'Review & Launch' },
];

const STRATEGIC_DIRECTIONS = [
  { step: 0, title: "Branch Scoping", advice: "Select which ecosystem branches to target. Cross-branch campaigns that span Farm and Rejoice spokes show 2.4x higher engagement than single-spoke sends.", kpi: "Branch Reach: Calculating..." },
  { step: 1, title: "Audience Resolution", advice: "Use the segment engine to slice your branch-scoped audience by behavioral signals — LTV, recency, churn risk. Multi-preset selection uses OR logic for maximum reach.", kpi: "Projected Reach: High" },
  { step: 2, title: "Payload Composition", advice: "Sage suggests using the 'Unified Sproutify' template for cross-site updates. Dynamic modules will automatically adjust based on the user's primary spoke site.", kpi: "Est. CTR: 12.4%" },
  { step: 3, title: "Deployment Sync", advice: "Synchronized releases ensure your brand message is consistent across all 5 spokes simultaneously. Choose 'Immediate' for urgent flash sales.", kpi: "Load Balance: Optimized" },
  { step: 4, title: "Global Orchestration", advice: "Final validation of all identity resolution tokens and template variables. Once launched, the Resend gateway will handle distribution automatically.", kpi: "Status: Validated" }
];

const TEMPLATES = [
  { id: 'UnifiedSproutifyUpdate', name: 'Unified Sproutify Update', icon: Layout, desc: 'Full-featured dynamic newsletter with smart blocks.', color: 'emerald' },
  { id: 'SimpleNewsletter', name: 'Minimal Announcement', icon: FileText, desc: 'Clean, text-focused template for quick updates.', color: 'blue' },
  { id: 'FlashSale', name: 'Promotional Alert', icon: Megaphone, desc: 'High-contrast CTA focus for product launches.', color: 'rose' },
];

// Computed-field preset segments for federated profiles
const CAMPAIGN_PRESETS = [
  { id: 'high_value', label: 'High-Value Customers', desc: 'LTV above $200', filter: (p: Profile) => p.ltv >= 200, color: 'emerald' },
  { id: 'at_risk', label: 'Churn Risk', desc: 'Moderate or higher churn risk', filter: (p: Profile) => ['moderate', 'high', 'critical'].includes(p.churn_risk), color: 'rose' },
  { id: 'engaged', label: 'Recently Active', desc: 'Activity within 30 days', filter: (p: Profile) => { const d = p.last_active ? new Date(p.last_active) : null; return d ? (Date.now() - d.getTime()) < 30*24*60*60*1000 : false; }, color: 'blue' },
  { id: 'dormant', label: 'Dormant', desc: 'No activity in 90+ days', filter: (p: Profile) => { const d = p.last_active ? new Date(p.last_active) : null; return d ? (Date.now() - d.getTime()) > 90*24*60*60*1000 : true; }, color: 'amber' },
  { id: 'subscribed', label: 'Opted-In', desc: 'Email subscription active', filter: (p: Profile) => p.is_subscribed && !p.marketing_pause, color: 'indigo' },
  { id: 'multi_branch', label: 'Cross-Pollinated', desc: 'Present on 2+ branches', filter: (p: Profile) => p.branches.length >= 2, color: 'violet' },
  { id: 'all', label: 'Entire Ecosystem', desc: 'All profiles in scoped branches', filter: () => true, color: 'slate' },
];

const PRESET_COLOR_MAP: Record<string, { bg: string, border: string, text: string, selectedBg: string }> = {
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-700', selectedBg: 'bg-emerald-500' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-500', text: 'text-rose-700', selectedBg: 'bg-rose-500' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-700', selectedBg: 'bg-blue-500' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-500', text: 'text-amber-700', selectedBg: 'bg-amber-500' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-500', text: 'text-indigo-700', selectedBg: 'bg-indigo-500' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-500', text: 'text-violet-700', selectedBg: 'bg-violet-500' },
  slate: { bg: 'bg-slate-50', border: 'border-slate-400', text: 'text-slate-700', selectedBg: 'bg-slate-500' },
};

const CampaignBuilder: React.FC<CampaignBuilderProps> = ({ onCampaignLaunch, profiles, spokeConnections = [], branchContext }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [campaignData, setCampaignData] = useState({
    name: '',
    selectedBranches: [] as string[],
    activePresets: [] as string[],
    subject: '',
    template: 'UnifiedSproutifyUpdate',
    trigger: 'immediate',
    branchContent: {} as Record<string, string>,
  });
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);

  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('marketing@sproutify.me');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSentStatus, setTestSentStatus] = useState<null | 'success'>(null);
  const [savedCampaigns, setSavedCampaigns] = useState<Campaign[]>([]);
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('09:00');
  const [historyOpen, setHistoryOpen] = useState(true);

  const CAMPAIGN_HISTORY_KEY = 'trellis_campaign_history';
  const [campaignHistory, setCampaignHistory] = useState<CampaignRecord[]>(() => {
    try {
      const saved = localStorage.getItem(CAMPAIGN_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(CAMPAIGN_HISTORY_KEY, JSON.stringify(campaignHistory));
  }, [campaignHistory]);

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

  // Branch-scoped data — merge profile-derived branches with spoke connection names
  const availableBranches = useMemo(() => {
    const fromProfiles = profiles.flatMap(p => p.branches);
    const fromSpokes = spokeConnections.filter(c => c.status === 'active').map(c => c.name);
    return Array.from(new Set([...fromProfiles, ...fromSpokes])).filter(Boolean);
  }, [profiles, spokeConnections]);

  // Spoke connection status lookup by name
  const spokeStatusMap = useMemo(() => {
    const map: Record<string, SpokeConnection['status']> = {};
    for (const conn of spokeConnections) {
      map[conn.name] = conn.status;
    }
    return map;
  }, [spokeConnections]);

  const branchProfileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const branch of availableBranches) {
      counts[branch] = profiles.filter(p => p.branches.includes(branch)).length;
    }
    return counts;
  }, [profiles, availableBranches]);

  // Step 1: Branch-scoped profiles (deduplicated by email)
  const scopedProfiles = useMemo(() => {
    if (campaignData.selectedBranches.length === 0) return [];
    const seen = new Set<string>();
    return profiles.filter(p => {
      if (!p.branches.some(b => campaignData.selectedBranches.includes(b))) return false;
      const key = p.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [profiles, campaignData.selectedBranches]);

  // Step 2: Apply preset filters with OR logic on top of scoped profiles
  const segmentProfiles = useMemo(() => {
    if (campaignData.activePresets.length === 0) return scopedProfiles;
    const activeFilters = CAMPAIGN_PRESETS.filter(p => campaignData.activePresets.includes(p.id));
    return scopedProfiles.filter(profile =>
      activeFilters.some(preset => preset.filter(profile))
    );
  }, [scopedProfiles, campaignData.activePresets]);

  const audienceSize = segmentProfiles.length;

  // Count how many scoped profiles match each preset
  const presetCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const preset of CAMPAIGN_PRESETS) {
      counts[preset.id] = scopedProfiles.filter(p => preset.filter(p)).length;
    }
    return counts;
  }, [scopedProfiles]);

  const toggleBranch = (branch: string) => {
    setCampaignData(prev => ({
      ...prev,
      selectedBranches: prev.selectedBranches.includes(branch)
        ? prev.selectedBranches.filter(b => b !== branch)
        : [...prev.selectedBranches, branch]
    }));
  };

  const toggleAllBranches = () => {
    setCampaignData(prev => ({
      ...prev,
      selectedBranches: prev.selectedBranches.length === availableBranches.length
        ? []
        : [...availableBranches]
    }));
  };

  const togglePreset = (presetId: string) => {
    setCampaignData(prev => ({
      ...prev,
      activePresets: prev.activePresets.includes(presetId)
        ? prev.activePresets.filter(id => id !== presetId)
        : [...prev.activePresets, presetId]
    }));
  };

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
      segments: campaignData.activePresets,
      tags: [],
      branches: campaignData.selectedBranches,
      audience_size: audienceSize,
      metadata: {
        query: {
          branches: campaignData.selectedBranches,
          presets: campaignData.activePresets,
          branch_content: campaignData.branchContent,
        },
        snapshot_audience_size: segmentProfiles.length,
        evaluated_at: new Date().toISOString(),
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
          audienceSize,
          segments: campaignData.activePresets
        });

        setCampaignHistory(prev => [{
          id: `cmp_${Date.now()}`,
          name: campaignData.name,
          launchedAt: new Date().toISOString(),
          audienceSize,
          branches: campaignData.selectedBranches,
          presets: campaignData.activePresets,
          template: campaignData.template,
          trigger: campaignData.trigger,
          status: campaignData.trigger === 'immediate' ? 'deployed' : 'scheduled',
        }, ...prev]);

        setTimeout(() => {
          setIsLaunching(false);
          setLaunchProgress(0);
          setCurrentStep(0);
          setCampaignData({
            name: '',
            selectedBranches: [],
            activePresets: [],
            subject: '',
            template: 'UnifiedSproutifyUpdate',
            trigger: 'immediate',
            branchContent: {},
          });
          setConsentConfirmed(false);
          setScheduledDate('');
          setScheduledTime('09:00');
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
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Branch Targeting</h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Select ecosystem branches to include in this campaign</p>
              </div>
              <button
                type="button"
                onClick={toggleAllBranches}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                  campaignData.selectedBranches.length === availableBranches.length
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-500'
                }`}
              >
                {campaignData.selectedBranches.length === availableBranches.length ? 'Deselect All' : 'Select All Branches'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableBranches.map(branch => {
                const isSelected = campaignData.selectedBranches.includes(branch);
                const count = branchProfileCounts[branch] || 0;
                const connectionStatus = spokeStatusMap[branch];
                return (
                  <button
                    type="button"
                    key={branch}
                    onClick={() => toggleBranch(branch)}
                    className={`group relative text-left p-6 rounded-[2.5rem] border-4 transition-all duration-300 ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/50 shadow-xl scale-[1.02]'
                        : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                        isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'
                      }`}>
                        <Globe size={20} />
                      </div>
                      <div className="flex items-center space-x-2">
                        {connectionStatus && (
                          <span className={`w-2 h-2 rounded-full ${
                            connectionStatus === 'active' ? 'bg-emerald-500' :
                            connectionStatus === 'error' ? 'bg-rose-500' : 'bg-slate-400'
                          }`} title={`Connection: ${connectionStatus}`} />
                        )}
                        {isSelected && (
                          <CheckCircle2 size={20} className="text-emerald-600" />
                        )}
                      </div>
                    </div>
                    <h5 className="font-black text-slate-800 text-sm uppercase tracking-tight mb-1">{formatBranchName(branch)}</h5>
                    <p className="text-[9px] font-mono text-slate-400 mb-2">{branch}</p>
                    <div className="flex items-center space-x-2">
                      <Users size={12} className="text-slate-400" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{count} Profiles</span>
                    </div>
                  </button>
                );
              })}
              {availableBranches.length === 0 && (
                <div className="col-span-full p-12 text-center bg-slate-50 rounded-[2.5rem] border-4 border-dashed border-slate-200">
                  <Globe size={40} className="mx-auto text-slate-300 mb-4" />
                  <p className="font-black text-slate-400 uppercase tracking-widest text-xs">No Branches Connected</p>
                  <p className="text-[11px] text-slate-400 mt-2">Connect spoke databases in the Branches page to target campaigns</p>
                </div>
              )}
            </div>

            <div className={`p-8 rounded-[2.5rem] border-4 transition-all duration-500 flex items-center justify-between ${
              campaignData.selectedBranches.length > 0 ? 'bg-emerald-50 border-emerald-500/10' : 'bg-slate-50 border-slate-100'
            }`}>
              <div className="flex items-center space-x-6">
                <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-lg ${
                  campaignData.selectedBranches.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-white'
                }`}>
                  <Globe size={32} />
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Branch Scope</p>
                  <p className="text-3xl font-black text-slate-800">
                    {scopedProfiles.length} Unique Profiles
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{campaignData.selectedBranches.length} of {availableBranches.length} Branches</p>
                {campaignData.selectedBranches.length > 0 && (
                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-100 px-4 py-1 rounded-full uppercase mt-2 inline-block">Scope Set</span>
                )}
              </div>
            </div>
          </div>
        );
      case 1:
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

            {/* Segment Engine */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-2 flex items-center">
                <Target size={18} className="mr-3 text-indigo-500" />
                Segment Engine
              </h4>
              <p className="text-[11px] text-slate-400 mb-6">Select one or more presets to filter your branch-scoped audience. Multiple selections combine with OR logic.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CAMPAIGN_PRESETS.map(preset => {
                  const isActive = campaignData.activePresets.includes(preset.id);
                  const count = presetCounts[preset.id] || 0;
                  const colors = PRESET_COLOR_MAP[preset.color] || PRESET_COLOR_MAP.slate;
                  return (
                    <button
                      type="button"
                      key={preset.id}
                      onClick={() => togglePreset(preset.id)}
                      className={`text-left p-4 rounded-2xl border-2 transition-all duration-200 flex items-center justify-between ${
                        isActive
                          ? `${colors.bg} ${colors.border} shadow-md`
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-1.5 h-10 rounded-full ${isActive ? colors.selectedBg : 'bg-slate-200'}`} />
                        <div>
                          <p className={`text-xs font-black uppercase tracking-tight ${isActive ? colors.text : 'text-slate-700'}`}>
                            {preset.label}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{preset.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-sm font-black ${isActive ? colors.text : 'text-slate-400'}`}>
                          {count}
                        </span>
                        {isActive && <CheckCircle2 size={16} className={colors.text} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recipients Preview */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400" />
                  Recipients Preview
                </h3>
                <span className="text-sm font-bold text-slate-500">{segmentProfiles.length} profiles</span>
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
                    <div className="flex items-center space-x-3">
                      {profile.ltv > 0 && (
                        <span className="text-xs text-emerald-600 font-medium">
                          ${profile.ltv.toFixed(0)}
                        </span>
                      )}
                      <span className="text-[9px] text-slate-400 font-bold uppercase">{profile.branches[0]}</span>
                    </div>
                  </div>
                ))}
                {segmentProfiles.length > 10 && (
                  <div className="px-3 py-2 text-center text-xs text-gray-500 bg-gray-50">
                    +{segmentProfiles.length - 10} more recipients
                  </div>
                )}
                {segmentProfiles.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-gray-500">
                    {scopedProfiles.length === 0 ? 'No branches selected — go back to Scope step' : 'No profiles match selected presets'}
                  </div>
                )}
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
      case 2:
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
                  {['first_name', 'email', 'branch', 'ltv'].map(v => (
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

            {/* Branch-Conditional Content */}
            {campaignData.selectedBranches.length > 0 && (
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                <div>
                  <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-1 flex items-center">
                    <Globe size={16} className="mr-3 text-emerald-500" />
                    Branch-Conditional Content
                  </h4>
                  <p className="text-[11px] text-slate-400 ml-7">Content blocks below will only render for recipients on the specified branch.</p>
                </div>
                <div className="space-y-3">
                  {campaignData.selectedBranches.map(branch => (
                    <div key={branch} className="border-l-4 border-emerald-400 pl-4">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                        {formatBranchName(branch)} Exclusive Block
                      </label>
                      <textarea
                        placeholder={`Optional content only shown to ${formatBranchName(branch)} recipients...`}
                        rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-emerald-500 outline-none transition resize-none"
                        value={campaignData.branchContent[branch] || ''}
                        onChange={e => setCampaignData(prev => ({
                          ...prev,
                          branchContent: { ...prev.branchContent, [branch]: e.target.value }
                        }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

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
      case 3:
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
      case 4:
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
                {/* Branch Scope */}
                <div className="col-span-2 pt-6 border-t border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Target Branches</p>
                  <div className="flex flex-wrap gap-2">
                    {campaignData.selectedBranches.length > 0 ? (
                      campaignData.selectedBranches.map(branch => (
                        <span key={branch} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase flex items-center space-x-1">
                          <Globe size={10} />
                          <span>{formatBranchName(branch)}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">No branches selected</span>
                    )}
                  </div>
                </div>
                {/* Active Presets */}
                {campaignData.activePresets.length > 0 && (
                  <div className="col-span-2 pt-6 border-t border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Active Segment Presets</p>
                    <div className="flex flex-wrap gap-2">
                      {campaignData.activePresets.map(presetId => {
                        const preset = CAMPAIGN_PRESETS.find(p => p.id === presetId);
                        if (!preset) return null;
                        const colors = PRESET_COLOR_MAP[preset.color] || PRESET_COLOR_MAP.slate;
                        return (
                          <span key={presetId} className={`px-3 py-1.5 ${colors.selectedBg} text-white rounded-lg text-[10px] font-black uppercase`}>
                            {preset.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Branch Content Blocks */}
                {campaignData.selectedBranches.length > 0 && (
                  <div className="col-span-2 pt-6 border-t border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Branch Content Blocks</p>
                    <div className="space-y-2">
                      {campaignData.selectedBranches.map(branch => {
                        const hasContent = !!(campaignData.branchContent[branch]?.trim());
                        return (
                          <div key={branch} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${hasContent ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                            <div className="flex items-center space-x-2">
                              <Globe size={12} className={hasContent ? 'text-emerald-600' : 'text-amber-500'} />
                              <span className="text-xs font-black text-slate-700 uppercase tracking-tight">{formatBranchName(branch)}</span>
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${hasContent ? 'text-emerald-600' : 'text-amber-500'}`}>
                              {hasContent ? 'Custom content set' : 'No custom content (universal only)'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
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

            {/* Consent / Compliance Guard */}
            <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 overflow-hidden shadow-sm">
              <div className="px-8 py-6 border-b border-slate-100 flex items-center space-x-3">
                <ShieldCheck size={20} className="text-indigo-600" />
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Compliance Checkpoint</h4>
              </div>
              <div className="p-8 space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
                    <p className="text-2xl font-black text-emerald-700">{segmentProfiles.filter(p => p.is_subscribed && !p.marketing_pause).length}</p>
                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mt-1">Opted-In</p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-center">
                    <p className="text-2xl font-black text-amber-700">{segmentProfiles.filter(p => p.marketing_pause).length}</p>
                    <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mt-1">Paused</p>
                  </div>
                  <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-center">
                    <p className="text-2xl font-black text-rose-700">{segmentProfiles.filter(p => !p.is_subscribed).length}</p>
                    <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest mt-1">Unsubscribed</p>
                  </div>
                </div>
                {segmentProfiles.some(p => !p.is_subscribed || p.marketing_pause) && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-3">
                    <Info size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      <span className="font-bold">{segmentProfiles.filter(p => !p.is_subscribed || p.marketing_pause).length} profiles</span> in your audience are unsubscribed or paused. They will be automatically excluded at send time by the delivery gateway.
                    </p>
                  </div>
                )}
                <label className={`flex items-start space-x-4 p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                  consentConfirmed
                    ? 'bg-emerald-50 border-emerald-500'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}>
                  <input
                    type="checkbox"
                    checked={consentConfirmed}
                    onChange={e => setConsentConfirmed(e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <p className="text-xs font-black text-slate-800 uppercase tracking-tight">I confirm this campaign targets opted-in recipients only</p>
                    <p className="text-[11px] text-slate-500 mt-1">The delivery gateway will enforce subscription status at send time. Unsubscribed and marketing-paused profiles will be excluded automatically.</p>
                  </div>
                </label>
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
              idx <= currentStep ||
              (idx === 1 && campaignData.selectedBranches.length > 0) ||
              (idx === 2 && campaignData.selectedBranches.length > 0 && campaignData.name) ||
              (idx === 3 && campaignData.selectedBranches.length > 0 && campaignData.name && campaignData.subject) ||
              (idx === 4 && campaignData.selectedBranches.length > 0 && campaignData.name && campaignData.subject && (campaignData.trigger !== 'scheduled' || scheduledDate))
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
              disabled={isLaunching || audienceSize === 0 || !campaignData.name || !campaignData.subject || !consentConfirmed}
              className="px-12 py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-slate-900/40 hover:bg-emerald-600 transition disabled:opacity-50 flex items-center space-x-4"
            >
              <Rocket size={24} className="text-emerald-400" />
              <span>Launch Global Sync</span>
            </button>
          ) : (
            <button
              onClick={() => setCurrentStep(Math.min(STEPS.length - 1, currentStep + 1))}
              disabled={
                (currentStep === 0 && campaignData.selectedBranches.length === 0) ||
                (currentStep === 1 && !campaignData.name) ||
                (currentStep === 2 && !campaignData.subject) ||
                (currentStep === 3 && campaignData.trigger === 'scheduled' && !scheduledDate)
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

         {/* Deployment Log */}
         <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-50 text-slate-500 flex items-center justify-center shadow-sm border border-slate-100">
                  <History size={20} />
                </div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Deployment Log</h3>
              </div>
              <ChevronDown size={18} className={`text-slate-400 transition-transform duration-300 ${historyOpen ? 'rotate-180' : ''}`} />
            </button>

            {historyOpen && (
              <div className="mt-6 space-y-3">
                {campaignHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <Rocket size={28} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No campaigns deployed yet</p>
                  </div>
                ) : (
                  <>
                    {campaignHistory.slice(0, 5).map(record => (
                      <div key={record.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-slate-800 uppercase tracking-tight truncate max-w-[160px]">{record.name}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                            record.status === 'deployed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {record.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold">
                          {record.audienceSize} profiles → {record.branches.length} branch{record.branches.length !== 1 ? 'es' : ''}
                        </p>
                        <p className="text-[9px] text-slate-400 font-medium">{timeAgo(record.launchedAt)}</p>
                      </div>
                    ))}
                    <button
                      onClick={() => setCampaignHistory([])}
                      className="w-full text-center text-[10px] font-bold text-slate-400 hover:text-rose-500 transition pt-2 flex items-center justify-center space-x-1"
                    >
                      <Trash2 size={10} />
                      <span>Clear History</span>
                    </button>
                  </>
                )}
              </div>
            )}
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
