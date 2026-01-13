
import React from 'react';
import { Profile } from '../types';
import { Smartphone, GraduationCap, Sprout, ShoppingBag, ExternalLink, ShieldCheck } from 'lucide-react';

interface UnifiedOnboardingProps {
  profile: Profile;
  themeColor?: string;
}

const UnifiedOnboarding: React.FC<UnifiedOnboardingProps> = ({ 
  profile, 
  themeColor = '#059669'
}) => {
  // Logic: Check if user comes from School site
  const isSchoolUser = profile.source_sites.includes('school.sproutify.app');
  // Logic: Check if user is NOT an app user
  const needsAppCTA = !profile.segments.includes('app_user');

  return (
    <div className="mx-auto bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden font-sans" style={{ maxWidth: '600px' }}>
      {/* Header Section */}
      <div style={{ backgroundColor: themeColor }} className="p-10 text-center">
        <h1 className="text-white text-3xl font-black tracking-tight">Welcome to Sproutify</h1>
        <p className="text-white/80 mt-1 font-medium italic">Your unified gardening ecosystem.</p>
      </div>

      <div className="p-8 space-y-8">
        {/* Intro */}
        <section>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Hey {profile.first_name}!</h2>
          <p className="text-slate-600 leading-relaxed">
            You are now connected to the Trellis Hub. We've synced your profile across our entire network to give you a seamless gardening experience.
          </p>
        </section>

        {/* MODULE 4: Conditional Logic Content (School) */}
        {isSchoolUser && (
          <section className="bg-indigo-50 border border-indigo-100 p-6 rounded-2xl animate-in fade-in duration-500">
            <div className="flex items-center space-x-3 mb-3">
              <GraduationCap className="text-indigo-600" size={24} />
              <h3 className="text-indigo-900 font-black text-xs uppercase tracking-widest">School Curriculum Sync</h3>
            </div>
            <p className="text-indigo-800 text-sm leading-relaxed mb-4 font-medium">
              We noticed you're part of <b>Sproutify School</b>! Your workshop credits and learning modules are ready in your dashboard.
            </p>
            <button className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 transition">
              Access Course Materials
            </button>
          </section>
        )}

        {/* Dynamic Content Grid */}
        <section className="grid grid-cols-2 gap-4">
           <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
              <Sprout size={18} className="text-emerald-600 mb-2" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Site</p>
              <p className="text-xs font-bold text-slate-700">{profile.source_sites[0] || 'Trellis Hub'}</p>
           </div>
           <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
              <ShoppingBag size={18} className="text-emerald-600 mb-2" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Member Status</p>
              <p className="text-xs font-bold text-slate-700">Inner Circle</p>
           </div>
        </section>

        {/* MODULE 4: Conditional Logic Content (App Download) */}
        {needsAppCTA && (
          <section className="bg-slate-900 p-8 rounded-3xl text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <div className="relative z-10">
              <Smartphone size={32} className="text-emerald-400 mx-auto mb-4" />
              <h3 className="text-white text-xl font-black mb-2 tracking-tight">Unlock Soil Intelligence</h3>
              <p className="text-slate-400 text-sm mb-6 max-w-[240px] mx-auto">Track soil pH and watering needs in real-time. Link your sensor to the Sproutify App.</p>
              <button className="bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold text-xs shadow-xl hover:bg-emerald-400 transition-colors">
                Download the App
              </button>
            </div>
          </section>
        )}

        <div className="pt-8 border-t border-slate-100 text-center opacity-40">
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 flex justify-center items-center">
              <ShieldCheck size={12} className="mr-2" /> Trellis Security Gateway
           </p>
           <p className="text-[9px] leading-relaxed">
             © {new Date().getFullYear()} Sproutify Inc. <br/>
             123 Sprout Way, Garden City, CA 90210
           </p>
        </div>
      </div>
    </div>
  );
};

export default UnifiedOnboarding;
