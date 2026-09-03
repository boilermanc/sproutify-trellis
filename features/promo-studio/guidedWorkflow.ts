export type PromoGuidedAction =
  | 'generate_plan' | 'queue_capture' | 'adopt_capture' | 'queue_voice'
  | 'adopt_voice_master' | 'queue_alignment' | 'queue_music' | 'queue_preview'
  | 'select_preview' | 'retry_job';

export type PromoGuidedGate =
  | 'review_claims' | 'review_script' | 'review_voice' | 'review_music'
  | 'review_preview' | 'ready_for_final' | 'blocked';

export interface PromoGuidedStep {
  phase: 'setup' | 'content' | 'production' | 'preview' | 'complete';
  status: 'action' | 'waiting' | 'review' | 'blocked' | 'complete';
  title: string;
  description: string;
  action?: PromoGuidedAction;
  gate?: PromoGuidedGate;
  target_id?: string;
  job_id?: string;
  progress?: number;
}

const ACTIVE = new Set(['queued', 'running', 'cancel_requested']);
const currentRows = (rows: any[], revisionId: string) => rows.filter(row => row?.revision_id === revisionId);
const latest = (rows: any[]) => [...rows].sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))[0];

const jobStep = (job: any, label: string): PromoGuidedStep | null => {
  if (!job) return null;
  if (ACTIVE.has(job.status)) return {
    phase: 'production', status: 'waiting', title: label,
    description: 'You can leave this screen open; progress refreshes automatically.',
    job_id: job.id, progress: Number(job.progress || 0),
  };
  if (job.status === 'failed' || job.status === 'cancelled') return {
    phase: 'production', status: 'blocked', title: `${label} needs attention`,
    description: job.error_message || 'The production job stopped before it finished.',
    action: 'retry_job', gate: 'blocked', job_id: job.id,
  };
  return null;
};

export function planPromoPreviewWorkflow(detail: any): PromoGuidedStep {
  const manifest = detail?.revision?.manifest;
  const revisionId = detail?.revision?.id;
  if (!manifest || !revisionId) return {
    phase: 'setup', status: 'blocked', gate: 'blocked', title: 'Create a promo first',
    description: 'Choose a branch, describe the promo, and create the draft.',
  };
  if (!detail.source) return {
    phase: 'setup', status: 'blocked', gate: 'blocked', title: 'Connect this branch',
    description: 'An administrator needs to finish the branch repository and capture setup once.',
  };
  if (!manifest.evidence?.repository) return {
    phase: 'content', status: 'action', action: 'generate_plan', title: 'Build the creative plan',
    description: 'Trellis will scan approved repository paths and draft evidence-backed claims, script, and shots.',
  };
  const claims = Array.isArray(manifest.evidence?.claims) ? manifest.evidence.claims : [];
  if (!claims.length || claims.some((claim: any) => !['verified', 'user_attested'].includes(claim.status) || claim.approved !== true)) return {
    phase: 'content', status: 'review', gate: 'review_claims', title: 'Review the claims',
    description: 'Approve only the statements you want Trellis to use. Unsupported claims must be revised or removed.',
  };
  if (manifest.script?.status !== 'approved') return {
    phase: 'content', status: 'review', gate: 'review_script', title: 'Review the script',
    description: 'Edit the displayed and spoken wording, then approve the script to begin production.',
  };

  const jobs = currentRows(detail.jobs || [], revisionId);
  const captureRuns = currentRows(detail.capture_runs || [], revisionId);
  const scenarios = Array.isArray(manifest.captures?.scenarios) ? manifest.captures.scenarios : [];
  const pendingScenario = scenarios.find((scenario: any) => scenario.status !== 'verified');
  if (pendingScenario) {
    if (!detail.source.capture_base_url || !detail.source.capture_fixture_key) return {
      phase: 'setup', status: 'blocked', gate: 'blocked', title: 'Finish capture setup',
      description: 'An administrator needs to add this branch’s approved capture URL and fixture once.',
    };
    const run = latest(captureRuns.filter((item: any) => item.status === 'succeeded'
      && (item.evidence?.scenario_id === pendingScenario.id || item.scenario_key === pendingScenario.key)));
    if (run) return {
      phase: 'production', status: 'action', action: 'adopt_capture', target_id: run.id,
      title: 'Attach verified product capture', description: 'Trellis verified the capture and will carry it into a new immutable revision.',
    };
    const captureJob = latest(jobs.filter((job: any) => job.job_type === 'capture'
      && job.input?.scenario_id === pendingScenario.id));
    const existing = jobStep(captureJob, 'Capturing the product');
    if (existing) return existing;
    return {
      phase: 'production', status: 'action', action: 'queue_capture', target_id: pendingScenario.id,
      title: 'Capture the real product', description: `Trellis will capture ${pendingScenario.route} using the approved branch fixture.`,
    };
  }

  const manifestVoiceIds = new Set((manifest.voice?.takes || []).map((take: any) => take.id));
  const voiceRows = detail.voice_takes || [];
  const selectedVoice = manifest.voice?.selected_take_id;
  if (!selectedVoice) {
    const awaitingApproval = voiceRows.find((take: any) => take.status === 'ready'
      && (manifest.voice?.takes || []).some((item: any) => item.id === take.id && item.status === 'aligning'));
    if (awaitingApproval) return {
      phase: 'production', status: 'review', gate: 'review_voice', target_id: awaitingApproval.id,
      title: 'Listen to the narration', description: 'Approve this voice take to create captions, or generate another take.',
    };
    const aligning = (manifest.voice?.takes || []).find((take: any) => take.status === 'aligning');
    if (aligning) {
      const alignmentJob = latest(jobs.filter((job: any) => job.job_type === 'voice_align' && job.input?.take_id === aligning.id));
      const existing = jobStep(alignmentJob, 'Aligning narration and captions');
      if (existing) return existing;
      return {
        phase: 'production', status: 'action', action: 'queue_alignment', target_id: aligning.id,
        title: 'Time the captions', description: 'Trellis will turn the narration’s exact phrase boundaries into caption cues.',
      };
    }
    const generated = voiceRows.find((take: any) => take.revision_id === revisionId
      && take.status === 'aligning' && !manifestVoiceIds.has(take.id));
    if (generated) return {
      phase: 'production', status: 'action', action: 'adopt_voice_master', target_id: generated.id,
      title: 'Prepare narration timing', description: 'Trellis will attach the generated master and continue into caption timing.',
    };
    const voiceJob = latest(jobs.filter((job: any) => job.job_type === 'voice_generate'));
    const existing = jobStep(voiceJob, 'Generating narration');
    if (existing) return existing;
    return {
      phase: 'production', status: 'action', action: 'queue_voice',
      title: 'Generate narration', description: 'Trellis will use this branch’s approved Brand Identity and voice profile.',
    };
  }

  const manifestMusicIds = new Set((manifest.music?.takes || []).map((take: any) => take.id));
  if (!manifest.music?.selected_take_id) {
    const music = (detail.music_takes || []).find((take: any) => take.revision_id === revisionId
      && take.status === 'ready' && !manifestMusicIds.has(take.id));
    if (music) return {
      phase: 'production', status: 'review', gate: 'review_music', target_id: music.id,
      title: 'Listen to the music', description: 'Approve this instrumental take, or generate another one before rendering.',
    };
    const musicJob = latest(jobs.filter((job: any) => job.job_type === 'music_generate'));
    const existing = jobStep(musicJob, 'Generating music');
    if (existing) return existing;
    return {
      phase: 'production', status: 'action', action: 'queue_music',
      title: 'Generate the soundtrack', description: 'Trellis will create instrumental music from this branch’s sonic profile.',
    };
  }

  const previewAssets = currentRows(detail.assets || [], revisionId).filter((asset: any) => asset.kind === 'render_preview' && asset.status === 'ready');
  if (!detail.project.selected_preview_render_id && previewAssets.length) return {
    phase: 'preview', status: 'action', action: 'select_preview', target_id: previewAssets[0].id,
    title: 'Prepare the preview', description: 'Trellis will attach the completed vertical preview for your review.',
  };
  if (!detail.project.selected_preview_render_id) {
    const renderJob = latest(jobs.filter((job: any) => job.job_type === 'preview_render'));
    const existing = jobStep(renderJob, 'Rendering your preview');
    if (existing) return { ...existing, phase: 'preview' };
    return {
      phase: 'preview', status: 'action', action: 'queue_preview',
      title: 'Render the preview', description: 'Trellis has everything it needs to assemble the vertical promo.',
    };
  }
  const previewApprovals = (detail.approvals || []).filter((approval: any) => approval.revision_id === revisionId
    && approval.gate === 'preview' && approval.subject_id === detail.project.selected_preview_render_id);
  const decision = latest(previewApprovals)?.decision;
  if (decision !== 'approved') return {
    phase: 'preview', status: 'review', gate: 'review_preview', target_id: detail.project.selected_preview_render_id,
    title: 'Review your preview', description: 'Watch the finished preview. Approve it when the voice, music, captions, and movement feel right.',
  };
  const finalAssets = currentRows(detail.assets || [], revisionId).filter((asset: any) => asset.kind === 'render_master' && asset.status === 'ready');
  if (finalAssets.length) return {
    phase: 'complete', status: 'complete', title: 'Final video ready',
    description: 'Add the Instagram caption and schedule the approved video below.',
  };
  const finalJob = latest(jobs.filter((job: any) => job.job_type === 'final_render'));
  const finalJobStep = jobStep(finalJob, 'Rendering the final video');
  if (finalJobStep) return { ...finalJobStep, phase: 'complete' };
  return {
    phase: 'complete', status: 'review', gate: 'ready_for_final',
    title: 'Preview approved', description: 'Create the final delivery video, then add a caption and schedule it.',
  };
}
