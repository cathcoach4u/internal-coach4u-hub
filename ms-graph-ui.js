// ms-graph-ui.js — Coach4U calendar + client-email UI handlers
// Extracted from index.html to keep it under the 1 MiB GitHub push limit.
// Classic script loaded AFTER the main inline script, so it shares the app's
// globals (supabase, contacts, toast, SUPABASE_EDGE_URL, getAnthropicKey,
// CATH_VOICE_REFERENCE, calContactName, getAUDateStr, loadCalendarEvents,
// renderCalWeek, closeModal). A syntax error here cannot break the main app.


// Pull the latest from Outlook via the ms-graph-calendar Edge Function, then re-render.
window.calSyncNow=async function(){
  const btn=document.getElementById('calSyncBtn');
  if(btn){ btn.disabled=true; btn.textContent='Syncing…'; }
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) throw new Error('Not signed in');
    const res=await fetch(`${SUPABASE_EDGE_URL}/ms-graph-calendar`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({action:'sync'})});
    const out=await res.json();
    if(!res.ok) throw new Error(out.error||('HTTP '+res.status));
    await loadCalendarEvents(); renderCalWeek();
    const s=out.synced||{}; const total=Object.values(s).reduce((a,b)=>a+(b||0),0);
    toast('Synced '+total+' events from Outlook','success');
  }catch(e){
    console.warn('calSyncNow',e);
    toast('Sync failed: '+e.message,'error');
    const b=document.getElementById('calSyncBtn'); if(b){ b.disabled=false; b.innerHTML='&#8635; Sync now'; }
  }
};

// Booking modal
window.openCalBook=function(){
  const sel=document.getElementById('calBookContact');
  const withEmail=contacts.filter(c=>c.email).sort((a,b)=>calContactName(a).localeCompare(calContactName(b)));
  sel.innerHTML='<option value="">— none —</option>'+withEmail.map(c=>'<option value="'+c.id+'">'+calContactName(c).replace(/</g,'&lt;')+' ('+(''+c.email).replace(/</g,'&lt;')+')</option>').join('');
  document.getElementById('calBookSubject').value='';
  document.getElementById('calBookSource').value='bookings';
  document.getElementById('calBookDuration').value='90';
  document.getElementById('calBookDate').value=getAUDateStr();
  document.getElementById('calBookTime').value='10:00';
  document.getElementById('calBookLocation').value='';
  document.getElementById('calBookNotes').value='';
  document.getElementById('calBookOnline').checked=false;
  document.getElementById('calBookModal').classList.add('open');
};
window.calBookContactChanged=function(){
  const sel=document.getElementById('calBookContact');
  const subj=document.getElementById('calBookSubject');
  if(sel.value && !subj.value.trim()){
    const c=contacts.find(x=>x.id===sel.value);
    if(c) subj.value='Session with '+calContactName(c);
  }
};
window.submitCalBook=async function(){
  const subject=document.getElementById('calBookSubject').value.trim();
  const source=document.getElementById('calBookSource').value;
  const date=document.getElementById('calBookDate').value;
  const time=document.getElementById('calBookTime').value;
  const dur=parseInt(document.getElementById('calBookDuration').value,10);
  const location=document.getElementById('calBookLocation').value.trim();
  const online=document.getElementById('calBookOnline').checked;
  const notes=document.getElementById('calBookNotes').value.trim();
  const contactId=document.getElementById('calBookContact').value;
  if(!subject){ toast('Add a title','error'); return; }
  if(!date||!time){ toast('Pick a date and start time','error'); return; }
  // naive Sydney wall-clock; the function passes timeZone Australia/Sydney to Graph
  const start=date+'T'+time+':00';
  const endD=new Date(date+'T'+time+':00Z'); endD.setUTCMinutes(endD.getUTCMinutes()+dur);
  const end=endD.toISOString().slice(0,19);
  let attendees=[];
  if(contactId){ const c=contacts.find(x=>x.id===contactId); if(c&&c.email) attendees=[{email:c.email,name:calContactName(c)}]; }
  const btn=document.getElementById('calBookSubmitBtn'); btn.disabled=true; btn.textContent='Creating…';
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) throw new Error('Not signed in');
    const res=await fetch(`${SUPABASE_EDGE_URL}/ms-graph-calendar`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({
      action:'book', source, subject, start, end, timeZone:'Australia/Sydney',
      location: location||undefined, online_meeting:online, body:notes||undefined,
      attendees, contact_id: contactId||undefined
    })});
    const out=await res.json();
    if(!res.ok) throw new Error(out.error||('HTTP '+res.status));
    closeModal('calBookModal');
    await loadCalendarEvents(); renderCalWeek();
    toast('Appointment booked','success');
  }catch(e){
    console.warn('submitCalBook',e);
    toast('Booking failed: '+e.message,'error');
  }finally{ btn.disabled=false; btn.textContent='Create appointment'; }
};

// ── Client emails (Outlook via ms-graph-mail) ──────────────────────────────
let clientEmailsCache=[];
function emEsc(s){return (''+(s||'')).replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function emDate(iso){ try{return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(iso));}catch(e){return '';} }
window.loadClientEmails=async function(emails){
  const box=document.getElementById('clientEmailsBox'); if(!box) return;
  if(!emails||!emails.length){ box.innerHTML='<div style="color:#94a3b8;font-size:13px;">No email address on file for this client.</div>'; return; }
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) throw new Error('Not signed in');
    const res=await fetch(`${SUPABASE_EDGE_URL}/ms-graph-mail`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({action:'list',emails})});
    const out=await res.json();
    if(!res.ok) throw new Error(out.error||('HTTP '+res.status));
    clientEmailsCache=(out.messages||[]).filter(m=>!m._error);
    renderClientEmailsList();
  }catch(e){
    box.innerHTML='<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;font-size:12px;color:#b91c1c;">Couldn\'t load emails: '+emEsc(e.message)+'</div>';
  }
};
function renderClientEmailsList(){
  const box=document.getElementById('clientEmailsBox'); if(!box) return;
  if(!clientEmailsCache.length){ box.innerHTML='<div style="color:#94a3b8;font-size:13px;">No recent emails found with this client.</div>'; return; }
  const srcLabel={contact:'contact@',work:'cath@coach4u',personal:'coachingwithcath'};
  box.innerHTML=clientEmailsCache.map((m,i)=>
    '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#fff;">'
    +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;">'
      +'<div style="font-weight:700;font-size:13px;color:#1e293b;min-width:0;">'+emEsc(m.from.name||m.from.email)+'</div>'
      +'<div style="font-size:11px;color:#94a3b8;flex-shrink:0;">'+emDate(m.received)+'</div>'
    +'</div>'
    +'<div style="font-size:13px;color:#334155;margin:2px 0 4px;font-weight:600;">'+emEsc(m.subject)+'</div>'
    +'<div style="font-size:12px;color:#64748b;line-height:1.5;">'+emEsc(m.preview).slice(0,180)+'</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;">'
      +'<span style="font-size:10px;color:#94a3b8;background:#f1f5f9;border-radius:99px;padding:2px 8px;">'+(srcLabel[m.source]||m.source)+'</span>'
      +'<button onclick="emailAiDraft('+i+')" style="background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;">&#10024; AI draft reply</button>'
      +(m.web_link?'<a href="'+m.web_link+'" target="_blank" rel="noopener" style="font-size:11px;color:#2563eb;text-decoration:none;font-weight:600;">Open in Outlook &#8599;</a>':'')
      +'<button onclick="emailDelete('+i+')" style="background:none;border:1px solid #fecaca;border-radius:6px;padding:5px 10px;font-size:11px;color:#dc2626;cursor:pointer;font-weight:600;">Delete</button>'
    +'</div>'
    +'<div id="emReply_'+i+'"></div>'
  +'</div>').join('');
}
window.emailAiDraft=async function(i){
  const m=clientEmailsCache[i]; if(!m) return;
  const slot=document.getElementById('emReply_'+i); if(!slot) return;
  if(!getAnthropicKey()){ toast('Set Anthropic API key first (AI bot settings)','error'); return; }
  slot.innerHTML='<div style="font-size:12px;color:#7c3aed;margin-top:8px;">Drafting in Cath\'s voice…</div>';
  try{
    const {data:{session}}=await supabase.auth.getSession();
    const gres=await fetch(`${SUPABASE_EDGE_URL}/ms-graph-mail`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({action:'get',source:m.source,message_id:m.id})});
    const full=await gres.json();
    if(!gres.ok) throw new Error(full.error||('HTTP '+gres.status));
    const emailText=(full.body_text||full.body_html||m.preview||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,4000);
    const prompt='You are drafting an email reply as Cath Baker of Coach4U. Use this voice and tone reference:\n\n'+CATH_VOICE_REFERENCE+'\n\nReply to the following email. Write only the reply body (no subject line, no preamble). Keep it warm, grounded and concise. Sign off as:\nThanks\nCath\n\n--- EMAIL FROM '+(m.from.name||m.from.email)+' ---\nSubject: '+m.subject+'\n\n'+emailText;
    const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':getAnthropicKey(),'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:800,messages:[{role:'user',content:prompt}]})});
    if(!resp.ok){ const t=await resp.text(); throw new Error('AI '+resp.status+': '+t.slice(0,150)); }
    const data=await resp.json();
    const draft=(data.content&&data.content[0]&&data.content[0].text)||'';
    slot.innerHTML='<textarea id="emDraft_'+i+'" rows="6" style="width:100%;margin-top:8px;font-family:inherit;font-size:13px;padding:10px;border:1px solid #ddd6fe;border-radius:8px;resize:vertical;">'+emEsc(draft)+'</textarea>'
      +'<div style="display:flex;gap:8px;margin-top:6px;">'
        +'<button onclick="emailSendReply('+i+')" style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;">Send reply</button>'
        +'<button onclick="document.getElementById(\'emReply_'+i+'\').innerHTML=\'\'" style="background:#f1f5f9;color:#475569;border:none;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;">Discard</button>'
      +'</div>';
  }catch(e){ slot.innerHTML='<div style="font-size:12px;color:#dc2626;margin-top:8px;">Draft failed: '+emEsc(e.message)+'</div>'; }
};
window.emailSendReply=async function(i){
  const m=clientEmailsCache[i]; if(!m) return;
  const ta=document.getElementById('emDraft_'+i); if(!ta) return;
  const bodyText=ta.value.trim(); if(!bodyText){ toast('Draft is empty','error'); return; }
  if(!confirm('Send this reply to '+(m.from.name||m.from.email)+'?')) return;
  const bodyHtml=bodyText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>');
  try{
    const {data:{session}}=await supabase.auth.getSession();
    const res=await fetch(`${SUPABASE_EDGE_URL}/ms-graph-mail`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({action:'send',source:m.source,reply_to_message_id:m.id,body:bodyHtml})});
    const out=await res.json();
    if(!res.ok) throw new Error(out.error||('HTTP '+res.status));
    document.getElementById('emReply_'+i).innerHTML='<div style="font-size:12px;color:#16a34a;margin-top:8px;font-weight:600;">&#10003; Reply sent</div>';
    toast('Reply sent','success');
  }catch(e){ toast('Send failed: '+e.message,'error'); }
};
window.emailDelete=async function(i){
  const m=clientEmailsCache[i]; if(!m) return;
  if(!confirm('Move this email to Deleted Items?')) return;
  try{
    const {data:{session}}=await supabase.auth.getSession();
    const res=await fetch(`${SUPABASE_EDGE_URL}/ms-graph-mail`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({action:'delete',source:m.source,message_id:m.id})});
    const out=await res.json();
    if(!res.ok) throw new Error(out.error||('HTTP '+res.status));
    clientEmailsCache.splice(i,1); renderClientEmailsList();
    toast('Moved to Deleted Items','success');
  }catch(e){ toast('Delete failed: '+e.message,'error'); }
};
