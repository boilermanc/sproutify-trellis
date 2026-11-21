import React from 'react';
import { createRoot } from 'react-dom/client';
import { ResendModal } from '../../pages/Campaigns';
import '../../index.css';
const campaign = {id:'579edbfb-33eb-439a-bee8-a8be1006137e',name:'Newsletter fixture',subject:'Hello 🙋‍♀️',branches:['atlurbanfarms'],send_status:'sent'} as any;
function Fixture() {
  const [open,setOpen]=React.useState(true);
  const [toast,setToast]=React.useState('');
  return <><p role="status">{toast}</p>{open && <ResendModal campaign={campaign} onClose={()=>setOpen(false)} onDone={()=>{}} addToast={setToast}/>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
