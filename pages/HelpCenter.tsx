
import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, Book, ShieldCheck, ChevronRight,
  Clock, Info, CheckCircle2,
  ArrowLeft, History, Timer,
  UserMinus, Recycle, Rocket, Layers
} from 'lucide-react';
import { CATEGORIES, ARTICLES, START_HERE_STEPS, isRecentlyAdded, Article, Category, StartHereStep } from '../src/data/helpContent';

interface HelpCenterProps {
  initialArticle?: Article | null;
}

const HelpCenter: React.FC<HelpCenterProps> = ({ initialArticle }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  useEffect(() => {
    if (initialArticle) setSelectedArticle(initialArticle);
  }, [initialArticle]);

  const filteredArticles = useMemo(() => {
    return ARTICLES.filter(art => {
      const matchesSearch = art.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           art.desc.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = !selectedCategory || art.cat === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [searchTerm, selectedCategory]);

  const renderArticle = (article: Article) => (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-500 pb-24">
      <button onClick={() => setSelectedArticle(null)} className="flex items-center space-x-3 text-slate-500 hover:text-emerald-600 transition-colors group">
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-black uppercase tracking-widest">Back to Help Center</span>
      </button>

      <div className="space-y-6 border-b border-slate-100 pb-12">
        <div className="flex items-center space-x-3 text-xs font-black text-emerald-600 uppercase tracking-widest">
           <span className="px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100">{article.cat}</span>
           <span className="text-slate-300">•</span>
           <span className="flex items-center"><Clock size={14} className="mr-2" /> {article.time} Read</span>
        </div>
        <h1 className="text-5xl font-black text-slate-800 tracking-tighter uppercase leading-[0.9]">{article.title}</h1>
        <p className="text-xl text-slate-500 font-medium italic leading-relaxed max-w-2xl">{article.desc}</p>
      </div>

      {article.content === 'COMING SOON' ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Clock size={32} className="text-slate-300" />
          <p className="text-slate-400 text-sm mt-4">This guide is being written.</p>
          <p className="text-slate-400 text-xs mt-2">Check back soon or ask Sage for help.</p>
        </div>
      ) : (
        <div className="prose prose-slate prose-lg max-w-none">
          {article.content.split('\n').map((line, i) => {
            if (line.trim().startsWith('###')) {
              return <h3 key={i} className="text-xl font-black text-slate-800 uppercase mt-12 mb-6">{line.replace('###', '').trim()}</h3>;
            }
            if (line.trim().startsWith('##')) {
              return <h2 key={i} className="text-3xl font-black text-slate-800 uppercase mt-16 mb-8">{line.replace('##', '').trim()}</h2>;
            }
            if (line.trim().startsWith('-')) {
              return <li key={i} className="text-slate-600 font-medium mb-2 ml-4 list-disc">{line.replace('-', '').trim()}</li>;
            }
            if (line.trim().match(/^\d\./)) {
               return <li key={i} className="text-slate-600 font-medium mb-2 ml-4 list-decimal">{line.replace(/^\d\./, '').trim()}</li>;
            }
            return line.trim() ? <p key={i} className="text-slate-600 leading-relaxed mb-6 font-medium">{line.trim()}</p> : null;
          })}
        </div>
      )}

      <div className="pt-12 border-t border-slate-100 flex items-center justify-between">
         <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-300"><Info size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Updated</p>
               <p className="text-xs font-bold text-slate-800">Feb 12, 2024 by DevOps Core</p>
            </div>
         </div>
      </div>
    </div>
  );

  if (selectedArticle) return renderArticle(selectedArticle);

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-40 animate-in fade-in duration-500">

      {/* SECTION 1: Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Help Center</h1>
          <p className="text-sm text-slate-500 mt-1">Find guides, technical references, and step-by-step walkthroughs.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="w-80 bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm text-slate-800 outline-none focus:border-emerald-500 transition"
            placeholder="Search guides..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* SECTION 2: Start Here Track */}
      {!searchTerm && !selectedCategory && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Rocket size={14} className="text-slate-400" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Here</span>
          </div>
          <div className="flex overflow-x-auto gap-4 pb-2">
            {START_HERE_STEPS.map(step => {
              const targetArticle = ARTICLES.find(a => a.id === step.articleId);
              return (
                <button
                  key={step.step}
                  onClick={() => targetArticle && setSelectedArticle(targetArticle)}
                  className="min-w-[220px] bg-white border border-slate-200 rounded-2xl p-5 text-left cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all flex-shrink-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-7 h-7 bg-emerald-50 text-emerald-600 text-xs font-black rounded-full flex items-center justify-center">
                      {step.step}
                    </div>
                    <step.icon size={18} className="text-slate-400" />
                  </div>
                  <p className="text-sm font-black text-slate-800 mt-3">{step.title}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{step.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: Categories */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-slate-400" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Browse by Topic</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              className={`relative p-4 rounded-2xl border-2 flex flex-col items-center text-center gap-2 transition-all ${
                selectedCategory === cat.id
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-400'
              }`}
            >
              {cat.id === 'technical' && (
                <span className="absolute top-2 right-2 bg-slate-800 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">DEV</span>
              )}
              <cat.icon size={20} />
              <span className="text-[10px] font-black uppercase tracking-wider">{cat.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 4: Articles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {selectedCategory
              ? `${CATEGORIES.find(c => c.id === selectedCategory)?.title || selectedCategory} Guides`
              : 'All Guides'}
          </span>
          {searchTerm && (
            <span className="text-xs text-slate-400">
              {filteredArticles.length} result{filteredArticles.length !== 1 ? 's' : ''} for &lsquo;{searchTerm}&rsquo;
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredArticles.map(art => (
            <button
              key={art.id}
              onClick={() => setSelectedArticle(art)}
              className="bg-white border border-slate-200 rounded-2xl p-6 text-left cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{art.cat}</span>
                <span className="flex items-center text-[9px] text-slate-400"><Clock size={10} className="mr-1" />{art.time}</span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <h4 className="text-base font-black text-slate-800 uppercase">{art.title}</h4>
                {art.content === 'COMING SOON' && (
                  <span className="bg-amber-50 text-amber-600 border border-amber-200 text-[9px] font-black px-2 py-0.5 rounded-full whitespace-nowrap">Coming Soon</span>
                )}
                {(art.publishedAt ? isRecentlyAdded(art.publishedAt) : false) && (
                  <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[9px] font-black px-2 py-0.5 rounded-full whitespace-nowrap">New</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{art.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HelpCenter;
