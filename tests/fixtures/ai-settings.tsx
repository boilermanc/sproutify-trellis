import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Settings from '../../pages/Settings';
import { DEFAULT_SECRETS } from '../../services/secretsService';
import { AI_CONFIGURED } from '../../services/aiBackend';
import '../../index.css';

function Fixture() {
  const [keys, setKeys] = useState({ ...DEFAULT_SECRETS, gemini_api_key: AI_CONFIGURED, openai_api_key: AI_CONFIGURED });
  const [fail, setFail] = useState(true);
  return <main><button onClick={() => setFail(false)}>Allow save</button><Settings apiKeys={keys} initialTab="api" branches={[]} spokeConnections={[]} onSpokeConnectionsChange={() => {}} onUpdateApiKeys={async next => {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (fail) return false;
    setKeys({ ...next, gemini_api_key: AI_CONFIGURED, openai_api_key: AI_CONFIGURED, anthropic_api_key: next.anthropic_api_key ? AI_CONFIGURED : '' });
    return true;
  }} /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
