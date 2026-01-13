
import React from 'react';
import { Profile, EmailModule, FooterConfig } from '../types';
import { Instagram, Twitter, Facebook, Smartphone, Award, ExternalLink, ShieldCheck } from 'lucide-react';

interface UnifiedSproutifyUpdateProps {
  profile: Profile;
  customCopy?: string;
  activeModules: EmailModule[];
  themeColor?: string;
  footerConfig?: FooterConfig;
}

const UnifiedSproutifyUpdate: React.FC<UnifiedSproutifyUpdateProps> = ({ 
  profile, 
  customCopy, 
  activeModules,
  themeColor = '#059669',
  footerConfig = {
    style: 'minimal',
    showSocial: true,
    platforms: ['instagram', 'tiktok'],
    address: '123 Sprout Way, Garden City, CA 90210',
    legalDisclaimer: "You're receiving this because you're a member of the Sproutify inner circle."
  }
}) => {
  const isVisible = (module: EmailModule) => activeModules.includes(module);

  const renderText = (text: string) => {
    return text.replace(/\{\{first_name\}\}/g, profile.first_name)
               .replace(/\{\{email\}\}/g, profile.email);
  };

  const SocialIcons = {
    instagram: <Instagram size={14} />,
    twitter: <Twitter size={14} />,
    facebook: <Facebook size={14} />,
    tiktok: <div className="font-black text-[10px]">TIK</div>
  };

  const renderFooter = () => {
    const { style, showSocial, platforms, address, legalDisclaimer } = footerConfig;

    switch (style) {
      case 'corporate':
        return (
          <div className="bg-slate-50 border-t border-slate-100 p-12 text-left">
            <div className="flex justify-between items-start mb-8">
              <div className="space-y-4">
                <h4 className="text-slate-800 font-black text-sm tracking-tighter flex items-center">
                  <ShieldCheck size={16} className="mr-2 text-emerald-600" />
                  SPROUTIFY INC.
                </h4>
                <p className="text-[10px] text-slate-400 leading-relaxed max-w-[200px]">
                  {address}
                </p>
              </div>
              {showSocial && (
                <div className="flex space-x-3">
                  {platforms.map(p => (
                    <a key={p} href="#" className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-slate-900 transition-colors">
                      {SocialIcons[p]}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[9px] text-slate-400 border-t border-slate-200 pt-6">
              {renderText(legalDisclaimer)}
              <br/><br/>
              © {new Date().getFullYear()} Sproutify Inc. All rights reserved. 
              <a href="#" className="ml-2 font-bold text-slate-600 hover:underline">Unsubscribe</a> | <a href="#" className="ml-2 font-bold text-slate-600 hover:underline">Privacy Policy</a>
            </p>
          </div>
        );

      case 'social':
        return (
          <div className="p-12 text-center" style={{ backgroundColor: `${themeColor}08` }}>
             <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6">Join Our Community</h4>
             <div className="flex justify-center space-x-4 mb-8">
               {platforms.map(p => (
                 <a key={p} href="#" className="w-10 h-10 flex items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-110" style={{ backgroundColor: themeColor }}>
                   {SocialIcons[p]}
                 </a>
               ))}
             </div>
             <p className="text-xs font-bold text-slate-800 mb-2">#SproutifyMoments</p>
             <p className="text-[10px] text-slate-400 max-w-[300px] mx-auto mb-6">Tag us for a chance to be featured in our monthly newsletter!</p>
             <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex justify-center space-x-4">
                <a href="#" className="hover:text-slate-900">Manage Settings</a>
                <span className="opacity-20">|</span>
                <a href="#" className="hover:text-slate-900">Unsubscribe</a>
             </div>
          </div>
        );

      case 'marketing':
        return (
          <div className="bg-slate-900 p-12 text-white">
            <div className="grid grid-cols-2 gap-8 mb-10 border-b border-white/10 pb-10">
              <div className="space-y-3">
                <Award size={20} className="text-emerald-400" />
                <h5 className="font-bold text-sm italic">Refer a Friend</h5>
                <p className="text-[10px] text-slate-400">Give $15, get $15. Share your unique link: <b>sproutify.me/{profile.first_name.toLowerCase()}</b></p>
              </div>
              <div className="space-y-3">
                <Smartphone size={20} className="text-emerald-400" />
                <h5 className="font-bold text-sm italic">Download Now</h5>
                <div className="flex flex-col space-y-2">
                   <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-[9px] font-bold flex items-center">
                     App Store <ExternalLink size={10} className="ml-auto opacity-40" />
                   </div>
                   <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-[9px] font-bold flex items-center">
                     Google Play <ExternalLink size={10} className="ml-auto opacity-40" />
                   </div>
                </div>
              </div>
            </div>
            <div className="text-center opacity-40 text-[9px] font-medium leading-relaxed">
              {address} <br/>
              © Sproutify Inc. Developed by Trellis Engine.
              <div className="mt-4 space-x-4">
                <a href="#" className="underline">Unsubscribe</a>
                <a href="#" className="underline">Email Preferences</a>
              </div>
            </div>
          </div>
        );

      default: // Minimal
        return (
          <div className="bg-slate-50 border-t border-slate-100 p-10 text-center">
            <p className="text-[10px] text-slate-400 mb-6 font-medium leading-relaxed">
              {renderText(legalDisclaimer)}<br/>
              {address}
            </p>
            <div className="flex justify-center space-x-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <a href="#" className="hover:text-slate-800 transition-colors">Preferences</a>
              <a href="#" className="hover:text-slate-800 transition-colors">Unsubscribe</a>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="mx-auto bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden font-sans transition-all duration-500" style={{ maxWidth: '600px' }}>
      {/* Module: Hero */}
      {isVisible('hero') && (
        <div style={{ backgroundColor: themeColor }} className="p-10 text-center transition-colors duration-500">
          <h1 className="text-white text-4xl font-black tracking-tight drop-shadow-sm">Sproutify</h1>
          <p className="text-white/80 mt-2 font-medium">Elevating your green space.</p>
        </div>
      )}

      <div className="p-8 space-y-10">
        {/* Module: Intro */}
        {isVisible('intro') && (
          <section className="animate-in fade-in slide-in-from-top-4 duration-500">
            <h2 className="text-2xl font-bold text-slate-800 mb-3">Hey {profile.first_name}!</h2>
            <div 
              className="text-slate-600 leading-relaxed italic border-l-4 pl-4 bg-slate-50 py-3"
              style={{ borderLeftColor: themeColor }}
            >
              {customCopy ? renderText(customCopy) : "Nature is calling. We've curated these updates based on your unique gardening journey."}
            </div>
          </section>
        )}

        {/* Module: Local Events */}
        {isVisible('events') && (
          <section className="bg-amber-50 border border-amber-200 p-6 rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-amber-800 font-black uppercase text-[10px] tracking-widest">Local Workshop</h3>
              <span className="bg-amber-200 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded-full">NEAR YOU</span>
            </div>
            <p className="text-amber-900 font-bold text-lg mb-1">Native Plant Exchange</p>
            <p className="text-amber-700 text-xs mb-4">Saturday, Nov 12th @ Downtown Plaza</p>
            <button 
              className="w-full py-3 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-900/20 transition-transform active:scale-95"
              style={{ backgroundColor: themeColor }}
            >
              Claim Your Spot
            </button>
          </section>
        )}

        {/* Module: Product Grid */}
        {isVisible('products') && (
          <section className="space-y-6">
            <div className="flex items-end justify-between">
              <h3 className="text-slate-800 font-black text-lg">Curated For You</h3>
              <a href="#" className="text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">Shop All</a>
            </div>
            <div className="grid grid-cols-2 gap-6">
              {[
                { name: 'Organic Soil Mix', price: '$14.99', img: 'plant1' },
                { name: 'Bonsai Pruning Kit', price: '$29.99', img: 'plant2' }
              ].map((p, i) => (
                <div key={i} className="group cursor-pointer">
                  <div className="aspect-square bg-slate-100 rounded-2xl mb-3 overflow-hidden">
                    <img 
                      src={`https://picsum.photos/seed/${p.img}/400/400`} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                      alt={p.name} 
                    />
                  </div>
                  <p className="font-bold text-sm text-slate-800 mb-1">{p.name}</p>
                  <p className="text-xs font-medium" style={{ color: themeColor }}>{p.price}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Module: App Promo */}
        {isVisible('app_promo') && (
          <section className="bg-slate-900 p-8 rounded-3xl text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <div className="relative z-10">
              <h3 className="text-white text-xl font-black mb-2">The Sproutify App</h3>
              <p className="text-slate-400 text-sm mb-6 max-w-[200px] mx-auto">Track watering and soil health from your pocket.</p>
              <button className="bg-white text-slate-900 px-8 py-3 rounded-xl font-bold text-xs shadow-xl hover:bg-slate-100 transition-colors">
                Get the App
              </button>
            </div>
          </section>
        )}

        {/* Module: Social Proof */}
        {isVisible('social_proof') && (
          <section className="py-4 border-y border-slate-100 text-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Trusted by over 10,000 gardeners</p>
            <div className="flex justify-center space-x-6 opacity-30 grayscale hover:grayscale-0 hover:opacity-100 transition-all">
              <span className="font-black italic text-slate-800">Gardenly</span>
              <span className="font-black italic text-slate-800">BotanyMag</span>
              <span className="font-black italic text-slate-800">EcoSeed</span>
            </div>
          </section>
        )}
      </div>

      {/* Module: Footer */}
      {isVisible('footer') && renderFooter()}
    </div>
  );
};

export default UnifiedSproutifyUpdate;
