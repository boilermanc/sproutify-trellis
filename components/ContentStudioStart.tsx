import React from 'react';
import { GitBranch } from 'lucide-react';

export default function ContentStudioStart({ title, nextAction, branchesAvailable }: {
  title: string;
  nextAction: string;
  branchesAvailable: boolean;
}) {
  return <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
    <div className="mb-4 inline-flex rounded-xl bg-emerald-50 p-3 text-emerald-700"><GitBranch size={22} /></div>
    <p className="text-xs font-bold text-slate-500">{title}</p>
    <h1 className="mt-2 text-2xl font-bold text-slate-900">Choose a branch to begin</h1>
    <p className="mt-3 text-sm leading-6 text-slate-600">{nextAction}</p>
    {branchesAvailable ? <button type="button" onClick={() => document.getElementById('studio-branch-picker')?.click()} className="mt-5 min-h-11 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">Choose branch</button> : <p role="status" className="mt-4 text-sm text-slate-500">No active branches are available yet. Add or enable a branch in Branches to get started.</p>}
  </section>;
}
