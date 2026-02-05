
import React, { useState, useMemo } from 'react';
import { Profile } from '../types';
import { GoogleGenAI } from '@google/genai';
import {
  BarChart3, Users, DollarSign, Tag, Sparkles, Send, RefreshCw,
  Activity, ShieldCheck, TrendingUp, AlertTriangle, Crown, Zap,
  ChevronRight, Heart, UserX, PauseCircle
} from 'lucide-react';

interface ReportsProps {
  profiles: Profile[];
}

interface SageMessage {
  role: 'user' | 'sage';
  content: string;
}

const Reports: React.FC<ReportsProps> = ({ profiles }) => {
  const [sageQuery, setSageQuery] = useState('');
  const [sageResponse, setSageResponse] = useState<string | null>(null);
  const [sageLoading, setSageLoading] = useState(false);
  const [sageHistory, setSageHistory] = useState<SageMessage[]>([]);

  // ═══════════════════════════════════════════════════════════════
  // CARD 1: Audience Composition
  // ═══════════════════════════════════════════════════════════════
  const audienceData = useMemo(() => {
    const total = profiles.length;

    // Gender distribution
    const genderCounts = { male: 0, female: 0, unknown: 0 };
    profiles.forEach(p => {
      const gender = p.metadata?.predicted_gender || 'unknown';
      if (gender === 'male') genderCounts.male++;
      else if (gender === 'female') genderCounts.female++;
      else genderCounts.unknown++;
    });

    // Source site distribution
    const sourceCounts: Record<string, number> = {};
    profiles.forEach(p => {
      const source = p.metadata?.source_site || 'Unknown';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });
    const topSources = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { total, genderCounts, topSources };
  }, [profiles]);

  // ═══════════════════════════════════════════════════════════════
  // CARD 2: LTV & Revenue Distribution
  // ═══════════════════════════════════════════════════════════════
  const ltvData = useMemo(() => {
    const ltvs = profiles.map(p => p.ltv || 0);
    const total = ltvs.reduce((sum, ltv) => sum + ltv, 0);
    const avg = profiles.length > 0 ? total / profiles.length : 0;

    // Median
    const sorted = [...ltvs].sort((a, b) => a - b);
    const median = sorted.length > 0
      ? sorted[Math.floor(sorted.length / 2)]
      : 0;

    // LTV Tiers
    const tiers = {
      zero: profiles.filter(p => (p.ltv || 0) === 0).length,
      micro: profiles.filter(p => (p.ltv || 0) > 0 && (p.ltv || 0) <= 50).length,
      standard: profiles.filter(p => (p.ltv || 0) > 50 && (p.ltv || 0) <= 200).length,
      premium: profiles.filter(p => (p.ltv || 0) > 200 && (p.ltv || 0) <= 500).length,
      vip: profiles.filter(p => (p.ltv || 0) > 500).length,
    };

    // Top 10 by LTV
    const topProfiles = [...profiles]
      .sort((a, b) => (b.ltv || 0) - (a.ltv || 0))
      .slice(0, 10);

    return { avg, median, tiers, topProfiles, total };
  }, [profiles]);

  // ═══════════════════════════════════════════════════════════════
  // CARD 3: Subscription Health
  // ═══════════════════════════════════════════════════════════════
  const subscriptionData = useMemo(() => {
    const subscribed = profiles.filter(p => p.is_subscribed).length;
    const unsubscribed = profiles.filter(p => !p.is_subscribed).length;
    const marketingPaused = profiles.filter(p => p.marketing_pause).length;

    // Churn risk distribution
    const churnRisk = {
      minimal: profiles.filter(p => p.churn_risk === 'minimal').length,
      moderate: profiles.filter(p => p.churn_risk === 'moderate').length,
      high: profiles.filter(p => p.churn_risk === 'high').length,
      critical: profiles.filter(p => p.churn_risk === 'critical').length,
    };

    // Status breakdown
    const statusCounts = {
      active: profiles.filter(p => p.status === 'active').length,
      archived: profiles.filter(p => p.status === 'archived').length,
      banned: profiles.filter(p => p.status === 'banned').length,
      deleted: profiles.filter(p => p.status === 'deleted').length,
    };

    return { subscribed, unsubscribed, marketingPaused, churnRisk, statusCounts };
  }, [profiles]);

  // ═══════════════════════════════════════════════════════════════
  // CARD 4: Segment & Tag Intelligence
  // ═══════════════════════════════════════════════════════════════
  const segmentData = useMemo(() => {
    // Segment counts
    const segmentCounts: Record<string, number> = {};
    let totalSegments = 0;
    profiles.forEach(p => {
      (p.segments || []).forEach(seg => {
        segmentCounts[seg] = (segmentCounts[seg] || 0) + 1;
        totalSegments++;
      });
    });
    const topSegments = Object.entries(segmentCounts)
      .sort((a, b) => b[1] - a[1]);

    // Tag counts
    const tagCounts: Record<string, number> = {};
    let totalTags = 0;
    profiles.forEach(p => {
      (p.tags || []).forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        totalTags++;
      });
    });
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    const avgSegmentsPerProfile = profiles.length > 0
      ? totalSegments / profiles.length
      : 0;
    const avgTagsPerProfile = profiles.length > 0
      ? totalTags / profiles.length
      : 0;

    return { topSegments, topTags, avgSegmentsPerProfile, avgTagsPerProfile };
  }, [profiles]);

  // ═══════════════════════════════════════════════════════════════
  // SAGE AI HANDLER
  // ═══════════════════════════════════════════════════════════════
  const handleSageSubmit = async () => {
    if (!sageQuery.trim() || sageLoading) return;

    const query = sageQuery.trim();
    setSageQuery('');
    setSageLoading(true);
    setSageHistory(prev => [...prev, { role: 'user', content: query }]);

    // Build statistical summary
    const sortedLtvs = [...profiles].map(p => p.ltv || 0).sort((a, b) => a - b);
    const statsSummary = {
      total_profiles: profiles.length,
      subscribed: profiles.filter(p => p.is_subscribed).length,
      unsubscribed: profiles.filter(p => !p.is_subscribed).length,
      marketing_paused: profiles.filter(p => p.marketing_pause).length,
      avg_ltv: profiles.length > 0
        ? (profiles.reduce((s, p) => s + (p.ltv || 0), 0) / profiles.length).toFixed(2)
        : '0.00',
      median_ltv: sortedLtvs.length > 0
        ? sortedLtvs[Math.floor(sortedLtvs.length / 2)]
        : 0,
      ltv_tiers: ltvData.tiers,
      churn_risk: subscriptionData.churnRisk,
      top_segments: segmentData.topSegments.slice(0, 10).map(([name, count]) => ({ name, count })),
      top_tags: segmentData.topTags.map(([name, count]) => ({ name, count })),
      site_distribution: audienceData.topSources.map(([site, count]) => ({ site, count })),
      status_breakdown: subscriptionData.statusCounts,
      gender_distribution: audienceData.genderCounts,
    };

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `You are Sage, the AI marketing strategist for Sproutify Trellis. You analyze customer data to provide actionable marketing insights.

Here is the current customer database summary:
${JSON.stringify(statsSummary, null, 2)}

The user's question: "${query}"

Provide a concise, data-driven answer. Reference specific numbers from the data. If suggesting actions, be specific about which segments or profiles to target. Keep response under 300 words.`,
      });

      const sageText = response.text || "I couldn't generate an insight. Please try again.";
      setSageResponse(sageText);
      setSageHistory(prev => [...prev, { role: 'sage', content: sageText }]);
    } catch (error) {
      const errorMsg = "Unable to connect to the Sage Intelligence Core. Please check your API configuration.";
      setSageResponse(errorMsg);
      setSageHistory(prev => [...prev, { role: 'sage', content: errorMsg }]);
    } finally {
      setSageLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSageSubmit();
    }
  };

  // Helper for percentage bar
  const PercentBar = ({ value, max, color }: { value: number; max: number; color: string }) => {
    const pct = max > 0 ? (value / max) * 100 : 0;
    return (
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-40">
      {/* Section Header */}
      <div className="flex items-center space-x-4">
        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl">
          <BarChart3 size={28} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Ecosystem Analytics</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Real-time Profile Intelligence</p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* PREBUILT ANALYTICS CARDS - 2x2 Grid */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Card 1: Audience Composition */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <Users size={20} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Audience Composition</p>
            </div>
            <span className="text-4xl font-black text-slate-800">{audienceData.total.toLocaleString()}</span>
          </div>

          {/* Gender Distribution */}
          <div className="space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Gender Distribution</p>
            {audienceData.genderCounts.male + audienceData.genderCounts.female > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600">Male</span>
                  <span className="font-black text-indigo-600">{audienceData.genderCounts.male} ({audienceData.total > 0 ? ((audienceData.genderCounts.male / audienceData.total) * 100).toFixed(1) : 0}%)</span>
                </div>
                <PercentBar value={audienceData.genderCounts.male} max={audienceData.total} color="bg-indigo-500" />

                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600">Female</span>
                  <span className="font-black text-rose-500">{audienceData.genderCounts.female} ({audienceData.total > 0 ? ((audienceData.genderCounts.female / audienceData.total) * 100).toFixed(1) : 0}%)</span>
                </div>
                <PercentBar value={audienceData.genderCounts.female} max={audienceData.total} color="bg-rose-400" />

                {audienceData.genderCounts.unknown > 0 && (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-600">Unknown</span>
                      <span className="font-black text-slate-400">{audienceData.genderCounts.unknown}</span>
                    </div>
                    <PercentBar value={audienceData.genderCounts.unknown} max={audienceData.total} color="bg-slate-300" />
                  </>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Demographics not yet computed</p>
            )}
          </div>

          {/* Top Sources */}
          <div className="space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Top Source Sites</p>
            <div className="space-y-2">
              {audienceData.topSources.length > 0 ? audienceData.topSources.map(([site, count], i) => (
                <div key={site} className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 truncate max-w-[180px]">{site}</span>
                  <span className="text-xs font-black text-emerald-600">{count}</span>
                </div>
              )) : (
                <p className="text-xs text-slate-400 italic">No source data available</p>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: LTV & Revenue Distribution */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <DollarSign size={20} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">LTV & Revenue</p>
            </div>
          </div>

          {/* LTV Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-2xl p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Avg LTV</p>
              <p className="text-2xl font-black text-slate-800">${ltvData.avg.toFixed(2)}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Median LTV</p>
              <p className="text-2xl font-black text-slate-800">${ltvData.median.toFixed(2)}</p>
            </div>
          </div>

          {/* LTV Tiers */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">LTV Distribution</p>
            {[
              { label: '$0 (No Revenue)', count: ltvData.tiers.zero, color: 'bg-slate-300' },
              { label: '$0.01-$50 (Micro)', count: ltvData.tiers.micro, color: 'bg-amber-400' },
              { label: '$50-$200 (Standard)', count: ltvData.tiers.standard, color: 'bg-emerald-400' },
              { label: '$200-$500 (Premium)', count: ltvData.tiers.premium, color: 'bg-indigo-500' },
              { label: '$500+ (VIP)', count: ltvData.tiers.vip, color: 'bg-purple-600' },
            ].map(tier => (
              <div key={tier.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600">{tier.label}</span>
                  <span className="font-black text-slate-700">{tier.count} ({profiles.length > 0 ? ((tier.count / profiles.length) * 100).toFixed(1) : 0}%)</span>
                </div>
                <PercentBar value={tier.count} max={profiles.length} color={tier.color} />
              </div>
            ))}
          </div>

          {/* Top 10 Profiles */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Top 10 by LTV</p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {ltvData.topProfiles.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-50">
                  <div className="flex items-center space-x-2">
                    {i === 0 && <Crown size={12} className="text-amber-500" />}
                    <span className="font-bold text-slate-600 truncate max-w-[120px]">{p.first_name} {p.last_name || ''}</span>
                  </div>
                  <span className="font-black text-emerald-600">${(p.ltv || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Subscription Health */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Subscription Health</p>
          </div>

          {/* Subscription Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-2xl p-4 text-center">
              <Heart size={16} className="mx-auto text-emerald-600 mb-1" />
              <p className="text-xl font-black text-emerald-700">{subscriptionData.subscribed}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-emerald-500">Subscribed</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 text-center">
              <UserX size={16} className="mx-auto text-slate-500 mb-1" />
              <p className="text-xl font-black text-slate-700">{subscriptionData.unsubscribed}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Unsubscribed</p>
            </div>
            <div className="bg-amber-50 rounded-2xl p-4 text-center">
              <PauseCircle size={16} className="mx-auto text-amber-600 mb-1" />
              <p className="text-xl font-black text-amber-700">{subscriptionData.marketingPaused}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-amber-500">Paused</p>
            </div>
          </div>

          {/* Churn Risk */}
          <div className="space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Churn Risk Distribution</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">
                Minimal: {subscriptionData.churnRisk.minimal}
              </span>
              <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-xs font-black">
                Moderate: {subscriptionData.churnRisk.moderate}
              </span>
              <span className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-full text-xs font-black">
                High: {subscriptionData.churnRisk.high}
              </span>
              <span className="px-3 py-1.5 bg-rose-100 text-rose-700 rounded-full text-xs font-black">
                Critical: {subscriptionData.churnRisk.critical}
              </span>
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Status Breakdown</p>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(subscriptionData.statusCounts).map(([status, count]) => (
                <div key={status} className="text-center">
                  <p className="text-lg font-black text-slate-800">{count}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 capitalize">{status}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 4: Segment & Tag Intelligence */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                <Tag size={20} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Segment & Tag Intelligence</p>
            </div>
          </div>

          {/* Averages */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-2xl p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Avg Segments/Profile</p>
              <p className="text-2xl font-black text-slate-800">{segmentData.avgSegmentsPerProfile.toFixed(1)}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Avg Tags/Profile</p>
              <p className="text-2xl font-black text-slate-800">{segmentData.avgTagsPerProfile.toFixed(1)}</p>
            </div>
          </div>

          {/* Top Segments */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Segments by Members</p>
            <div className="max-h-28 overflow-y-auto space-y-1">
              {segmentData.topSegments.length > 0 ? segmentData.topSegments.map(([seg, count]) => (
                <div key={seg} className="flex items-center justify-between text-xs py-1">
                  <span className="font-bold text-slate-600 truncate max-w-[180px]">{seg}</span>
                  <span className="font-black text-purple-600">{count}</span>
                </div>
              )) : (
                <p className="text-xs text-slate-400 italic">No segments defined</p>
              )}
            </div>
          </div>

          {/* Top Tags */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Top 15 Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {segmentData.topTags.length > 0 ? segmentData.topTags.map(([tag, count]) => (
                <span key={tag} className="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg text-[10px] font-black">
                  {tag} ({count})
                </span>
              )) : (
                <p className="text-xs text-slate-400 italic">No tags assigned</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ASK SAGE — AI Analysis Panel */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-6 pb-6 border-b border-slate-800">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg">
            <Sparkles size={24} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-tight">Ask Sage</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ad Hoc AI Analysis</p>
          </div>
        </div>

        {/* Chat History */}
        <div className="min-h-[200px] max-h-[400px] overflow-y-auto space-y-4 mb-6">
          {sageHistory.length === 0 ? (
            <div className="text-center py-16 opacity-30">
              <Activity size={48} className="mx-auto text-slate-500 mb-4" />
              <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Sage Intelligence Dormant</p>
              <p className="text-xs text-slate-600 mt-2">Ask a question about your customer data to activate</p>
            </div>
          ) : (
            sageHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-4 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-sm'
                    : 'bg-slate-800 text-slate-200 rounded-bl-sm'
                }`}>
                  {msg.role === 'sage' && (
                    <div className="flex items-center space-x-2 mb-2">
                      <Sparkles size={12} className="text-emerald-400" />
                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Sage</span>
                    </div>
                  )}
                  <p className={`text-sm leading-relaxed ${msg.role === 'sage' ? 'italic' : ''}`}>
                    {msg.content}
                  </p>
                </div>
              </div>
            ))
          )}

          {/* Loading State */}
          {sageLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-800 p-4 rounded-2xl rounded-bl-sm">
                <div className="flex items-center space-x-3">
                  <RefreshCw size={16} className="text-emerald-400 animate-spin" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">
                    Sage is analyzing your ecosystem...
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex items-center space-x-4">
          <input
            type="text"
            value={sageQuery}
            onChange={(e) => setSageQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Sage about your customer data..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-6 py-4 text-white text-sm font-medium placeholder:text-slate-500 outline-none focus:border-emerald-500 transition"
            disabled={sageLoading}
          />
          <button
            onClick={handleSageSubmit}
            disabled={sageLoading || !sageQuery.trim()}
            className="w-14 h-14 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-2xl flex items-center justify-center transition shadow-lg"
          >
            {sageLoading ? (
              <RefreshCw size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>

        {/* Quick Prompts */}
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            'Who are my highest value customers?',
            'Which segments are at risk of churning?',
            'How can I improve subscription rates?',
            'What marketing campaigns should I run?',
          ].map(prompt => (
            <button
              key={prompt}
              onClick={() => setSageQuery(prompt)}
              disabled={sageLoading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Reports;
