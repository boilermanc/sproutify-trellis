import React from 'react';
import { GitBranch } from 'lucide-react';
import type { ViewState } from '../types';
import { CONTENT_STUDIO_GUIDES } from './contentStudioGuides';

export default function ContentStudioStart({ view, title, nextAction, branchesAvailable }: {
  view: ViewState;
  title: string;
  nextAction: string;
  branchesAvailable: boolean;
}) {
  const guide = CONTENT_STUDIO_GUIDES[view];
  const Icon = guide?.icon || GitBranch;
  return <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
    <div className="flex items-center gap-4">
      <div className="inline-flex shrink-0 rounded-2xl bg-emerald-50 p-4 text-emerald-700"><Icon size={30} aria-hidden="true" /></div>
      <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Content Studio</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{title}</h2></div>
    </div>
    {guide && <div className="mt-5">
      <p className="text-base leading-7 text-slate-600">{guide.description}</p>
      <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-900">Try it for: </span>{guide.example}</p>
      <ol aria-label={`${title} workflow`} className="mt-5 grid gap-3 sm:grid-cols-3">
        {guide.steps.map((step, index) => <li key={step} className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-sm font-medium text-slate-700"><span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-emerald-700">{index + 1}</span>{step}</li>)}
      </ol>
    </div>}
    <div className="mt-6 border-t border-slate-100 pt-5">
      <h1 className="text-xl font-bold text-slate-900">Choose a branch to begin</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{nextAction}</p>
      {branchesAvailable ? <button type="button" onClick={() => document.getElementById('studio-branch-picker')?.click()} className="mt-5 min-h-11 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">Choose branch</button> : <p role="status" className="mt-4 text-sm text-slate-500">No active branches are available yet. Add or enable a branch in Branches to get started.</p>}
    </div>
  </section>;
}
