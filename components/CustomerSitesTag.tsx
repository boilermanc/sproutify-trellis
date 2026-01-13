
import React from 'react';
import { Globe, GraduationCap, Sprout, Heart, Building2 } from 'lucide-react';

interface CustomerSitesTagProps {
  sites: string[];
}

const SITE_CONFIG: Record<string, { label: string, color: string, icon: any }> = {
  'atlurbanfarms.com': { label: 'Urban Farms', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Building2 },
  'micro.sproutify.app': { label: 'Micro', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Sprout },
  'farm.sproutify.app': { label: 'Farm', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: Sprout },
  'school.sproutify.app': { label: 'School', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: GraduationCap },
  'letsrejoice.app': { label: 'Rejoice', color: 'bg-rose-100 text-rose-700 border-rose-200', icon: Heart },
};

const CustomerSitesTag: React.FC<CustomerSitesTagProps> = ({ sites }) => {
  if (!sites || sites.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {sites.map(site => {
        const config = SITE_CONFIG[site] || { label: site, color: 'bg-slate-100 text-slate-600 border-slate-200', icon: Globe };
        const Icon = config.icon;
        
        return (
          <div 
            key={site} 
            className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-tighter shadow-sm transition-transform hover:scale-105 cursor-default ${config.color}`}
            title={site}
          >
            <Icon size={10} />
            <span>{config.label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default CustomerSitesTag;
