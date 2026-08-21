import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, CircleDollarSign, Image, LibraryBig, ListChecks, Mic2, Play, Send, Sparkles, Video } from 'lucide-react';

const modes = [
  { icon: Sparkles, name: 'Text to video', needs: 'A shot description. No upload is required.' },
  { icon: Image, name: 'Image to video', needs: 'A starting image plus a description of the motion.' },
  { icon: Mic2, name: 'Talking character', needs: 'One clear character image, speech audio, and a short direction.' },
  { icon: Video, name: 'Continue a video', needs: 'The source video plus a description of what happens next.' },
];

const steps = [
  ['1', 'Choose a project', 'Use an existing project or create one for the campaign or character.'],
  ['2', 'Pick the model and mode', 'LongCat Base creates or continues scenes. Avatar 1.5 drives a character from speech audio.'],
  ['3', 'Describe the shot', 'Name the subject, action, setting, camera movement, lighting, and mood. Add only the files required by the selected mode.'],
  ['4', 'Review the cost', 'Trellis shows the estimate before anything is submitted. Confirming is the only action that can start billable GPU work.'],
  ['5', 'Watch the queue', 'The job moves from queued to running to succeeded. You can cancel an active job or retry a failed attempt within the limits.'],
  ['6', 'Review and publish', 'Open Created media, preview the result, approve it, then send it to the existing Instagram or TikTok scheduler.'],
];

const MediaGenerationGuide: React.FC = () => {
  const [open, setOpen] = useState(true);

  return (
    <section className="overflow-hidden rounded-3xl border border-indigo-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 p-5 text-left">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-indigo-50 p-3"><BookOpen className="h-5 w-5 text-indigo-600" /></div>
          <div><h2 className="text-base font-black text-slate-900">How to use Media Generation</h2><p className="mt-1 text-xs text-slate-500">Start small, review the price, then approve the result before publishing.</p></div>
        </div>
        {open ? <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" /> : <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />}
      </button>

      {open && <div className="border-t border-indigo-100 p-5">
        <div className="rounded-2xl bg-slate-950 p-5 text-white">
          <div className="flex items-center gap-2 text-sm font-black"><Play className="h-4 w-4 fill-current text-emerald-400" /> Recommended first test</div>
          <p className="mt-2 text-xs leading-5 text-slate-300">Choose <strong className="text-white">LongCat Base → Text to video → 1 sec</strong>. Try: “A slow cinematic push-in toward a vinyl record spinning in a warm, moody listening room, shallow depth of field.” Then select <strong className="text-white">Review cost</strong>. Nothing is billed until you select <strong className="text-white">Confirm & generate</strong>.</p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modes.map(({ icon: Icon, name, needs }) => <div key={name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><Icon className="h-5 w-5 text-indigo-600" /><h3 className="mt-3 text-xs font-black text-slate-900">{name}</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">{needs}</p></div>)}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {steps.map(([number, title, detail]) => <div key={number} className="flex gap-3 rounded-2xl border border-slate-100 p-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-black text-white">{number}</span><div><h3 className="text-xs font-black text-slate-900">{title}</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</p></div></div>)}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="flex gap-3 rounded-2xl bg-emerald-50 p-4"><CircleDollarSign className="h-5 w-5 shrink-0 text-emerald-700" /><p className="text-[11px] leading-5 text-emerald-800"><strong>Cost safety:</strong> one worker maximum, daily limits, and a confirmation before each billable job.</p></div>
          <div className="flex gap-3 rounded-2xl bg-indigo-50 p-4"><ListChecks className="h-5 w-5 shrink-0 text-indigo-700" /><p className="text-[11px] leading-5 text-indigo-800"><strong>Approval:</strong> a finished video cannot enter publishing until you approve it.</p></div>
          <div className="flex gap-3 rounded-2xl bg-violet-50 p-4"><Send className="h-5 w-5 shrink-0 text-violet-700" /><p className="text-[11px] leading-5 text-violet-800"><strong>Publishing:</strong> use Created media to schedule approved videos for Instagram or TikTok.</p></div>
        </div>

        <p className="mt-4 flex items-center gap-2 text-[11px] font-bold text-slate-500"><LibraryBig className="h-4 w-4 text-indigo-600" /> Existing Video Ad Lab, Clip Studio, Episodes, and Studio Albums are still available; this does not replace them.</p>
      </div>}
    </section>
  );
};

export default MediaGenerationGuide;
