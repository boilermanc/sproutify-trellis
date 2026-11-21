import React from 'react';
import { createRoot } from 'react-dom/client';
import Chat from '../../components/SocialIdeaChat';
import { useSavedSocialIdea } from '../../hooks/useSavedSocialIdea';
import '../../index.css';
      function App() {
        const [id, setId] = React.useState('garden'); const [show, setShow] = React.useState(true);
        const [notes, setNotes] = useSavedSocialIdea(id, 'notes');
        return React.createElement('main', { style: { padding: 20 } },
          React.createElement('button', { onClick: () => setId('music') }, 'Switch brand'),
          React.createElement('button', { onClick: () => setId('garden') }, 'Return to garden'),
          React.createElement('button', { onClick: () => setShow(s => !s) }, 'Toggle chat view'),
          show && React.createElement(Chat, { key: id, brand: { id, name: id === 'garden' ? 'Fixture Garden' : 'Fixture Music', tone: 'friendly', description: 'A community brand' }, apiKeys: { active_llm: 'gemini', gemini_api_key: 'fixture-only' }, notes, onUseBrief: text => setNotes(n => n + '\n' + text) }),
          React.createElement('textarea', { 'aria-label': 'Post notes', value: notes, onChange: e => setNotes(e.target.value) }),
          React.createElement('p', { id: 'notes' }, notes));
      }
      createRoot(document.getElementById('root')).render(React.createElement(App));
