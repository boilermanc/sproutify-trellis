import React from 'react';
import { createRoot } from 'react-dom/client';
import ClipVideoEditor from '../../components/ClipVideoEditor';
import '../../index.css';
createRoot(document.getElementById('root')!).render(<main className="p-6"><ClipVideoEditor branchName="Sproutify Home" onBack={() => {}} addToast={() => {}}/></main>);
