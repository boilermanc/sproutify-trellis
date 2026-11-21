import React from 'react';
import { createRoot } from 'react-dom/client';
import CardStudio from '../../pages/CardStudio';
import { DEFAULT_SECRETS } from '../../services/secretsService';
import type { BranchContext } from '../../types';
import '../../index.css';

const branchContext = { allBranches: [{ id: 'fixture', slug: 'fixture', name: 'Fixture Garden' }, { id: 'rekkrd', slug: 'rekkrd', name: 'Rekkrd' }, { id: 'rejoice', slug: 'rejoice', name: 'Rejoice' }] } as BranchContext;
function Fixture() {
  const [slug, setSlug] = React.useState('fixture');
  const [toast, setToast] = React.useState('');
  return <><label>Preview brand<select aria-label="Preview brand" value={slug} onChange={e => setSlug(e.target.value)}>{branchContext.allBranches.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}</select></label><p role="status">{toast}</p><CardStudio selectedBranchSlug={slug} branchContext={branchContext} apiKeys={{ ...DEFAULT_SECRETS, gemini_api_key: '__configured_server_side__' }} addToast={setToast} /></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
