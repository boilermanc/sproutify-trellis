import { HelpCircle } from 'lucide-react';
import { Article, ARTICLES } from '../data/helpContent';

interface HelpLinkProps {
  articleId: string;
  label?: string;
  onOpenArticle: (article: Article) => void;
  variant?: 'inline' | 'badge' | 'icon-only';
}

export default function HelpLink({
  articleId,
  label = 'How does this work?',
  onOpenArticle,
  variant = 'inline',
}: HelpLinkProps) {
  const article = ARTICLES.find(a => a.id === articleId);
  if (!article) return null;

  const handleClick = () => {
    onOpenArticle(article);
  };

  if (variant === 'icon-only') {
    return (
      <span
        onClick={handleClick}
        title={label}
        className="p-1 rounded-lg text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all cursor-pointer"
      >
        <HelpCircle size={14} />
      </span>
    );
  }

  if (variant === 'badge') {
    return (
      <span
        onClick={handleClick}
        className="inline-flex items-center space-x-1 px-2 py-0.5 bg-slate-100 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-full text-[9px] font-black uppercase tracking-wider text-slate-500 hover:text-emerald-600 transition-all cursor-pointer"
      >
        <HelpCircle size={10} />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span
      onClick={handleClick}
      className="flex items-center space-x-1 text-[10px] font-bold text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer group"
    >
      <HelpCircle size={12} />
      <span>{label}</span>
    </span>
  );
}
