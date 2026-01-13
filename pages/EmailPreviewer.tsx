
import React, { useState } from 'react';
import { MOCK_PROFILES } from '../constants';
import UnifiedOnboarding from '../components/UnifiedOnboarding';
import { Profile } from '../types';
import { 
  Smartphone, Mail, RefreshCw, Monitor, Palette,
  Globe, Zap, Info, ExternalLink
} from 'lucide-react';

const THEME_PRESETS = [
  { name: 'Sproutify Green', color: '#059669' },
  { name: 'Organic Earth', color: '#92400e' },
  { name: 'Modern Tech', color: '#4f46e5' },
];

interface EmailPreviewerProps {
  initialEmail?: string | null;
  // Added profiles prop to match App.tsx usage and provide dynamic data
  profiles: Profile[];
}

// Updated component to accept profiles prop
const EmailPreviewer: React.FC<EmailPreviewerProps> = ({ initialEmail, profiles }) => {
  // Initialize with the provided email if present, otherwise default to first profile from state
  const [selectedProfile, setSelectedProfile] = useState<Profile>(() => {
    if (initialEmail) {
      return profiles.find(p => p.email === initialEmail) || profiles[0] || MOCK_PROFILES[0];
    }
    return profiles[0] || MOCK_PROFILES[0];
  });
  const [themeColor, setThemeColor] = useState(THEME_PRESETS[0].color);
  const [isMobile, setIsMobile] = useState(false);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 pb-20">
      {/* Sidebar: Configuration */}
      <div className="xl:col-span-1 space-y-6">
        
        <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex items-start space-x-3 mb-4">
           <Info size={16} className="text-emerald-600 mt-1" />
           <p className="text-[10px] text-emerald-800 leading-relaxed font-bold uppercase tracking-tight">
             This preview uses <b>Module 4</b> Onboarding Logic. Try switching to "Mike" to see the School-specific layout.
           </p>
        </div>

        {/* Recipient Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-2 mb-4">
            <Mail size={16} className="text-slate-400" />
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Select Audience</h3>
          </div>
          <select 
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
            value={selectedProfile.email}
            onChange={(e) => {
              // Use profiles prop instead of MOCK_PROFILES
              const p = profiles.find(x => x.email === e.target.value);
              if (p) setSelectedProfile(p);
            }}
          >
            {/* Map over dynamic profiles instead of MOCK_PROFILES */}
            {profiles.map(p => (
              <option key={p.email} value={p.email}>{p.first_name} (Source: {p.source_sites[0]})</option>
            ))}
          </select>
        </div>

        {/* Brand Theming */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-2 mb-4">
            <Palette size={16} className="text-slate-400" />
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Theme</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {THEME_PRESETS.map(t => (
              <button
                key={t.color}
                onClick={() => setThemeColor(t.color)}
                className={`aspect-square rounded-full border-2 transition-all transform hover:scale-110 ${
                  themeColor === t.color ? 'border-slate-900' : 'border-transparent'
                }`}
                style={{ backgroundColor: t.color }}
              />
            ))}
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
              <Zap size={64} className="text-emerald-400" />
           </div>
           <h4 className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-2">Sync Intelligence</h4>
           <p className="text-[10px] text-slate-400 leading-relaxed italic">
             "UnifiedOnboarding.tsx" detects if profile came from <b>School</b> and injects workshop credits automatically.
           </p>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="xl:col-span-3 flex flex-col h-full space-y-4">
        {/* Preview Toolbar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setIsMobile(false)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${!isMobile ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
            >
              <Monitor size={14} />
              <span>Desktop</span>
            </button>
            <button 
              onClick={() => setIsMobile(true)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition ${isMobile ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
            >
              <Smartphone size={14} />
              <span>Mobile</span>
            </button>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-[10px] font-bold text-slate-400 flex items-center">
              <Globe size={12} className="mr-2" /> {selectedProfile.source_sites.join(', ')}
            </div>
          </div>
        </div>

        {/* The Email Wrapper */}
        <div className="flex-1 bg-slate-200 rounded-3xl p-8 overflow-y-auto custom-scrollbar flex justify-center items-start">
          <div 
            className={`transition-all duration-500 shadow-2xl rounded-2xl overflow-hidden ${isMobile ? 'w-[375px]' : 'w-full'}`}
          >
            <UnifiedOnboarding 
              profile={selectedProfile} 
              themeColor={themeColor}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailPreviewer;
