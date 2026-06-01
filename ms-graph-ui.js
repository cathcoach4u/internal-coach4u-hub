// ms-graph-ui.js — Coach4U calendar + client-email UI handlers
// Extracted from index.html to keep it under the 1 MiB GitHub push limit.
// The main app runs inside an IIFE, so its internals aren't global. index.html
// exposes the handful this file needs on window.CB (the "bridge"), set just
// before the main IIFE closes. A syntax error in this file cannot break the
// main app. Defines window.calSyncNow / openCalBook / calBookSearch / calBookPick /
// submitCalBook / loadClientEmails / emailAiDraft / emailSendReply / emailDelete.
(function(){
'use strict';
var CB=window.CB||{};
var supabase=CB.sb, SUPABASE_EDGE_URL=CB.EDGE, toast=CB.toast, getAUDateStr=CB.getAUDateStr,
    closeModal=CB.closeModal, getAnthropicKey=CB.getAnthropicKey, CATH_VOICE_REFERENCE=CB.voice;
function getContacts(){ return (CB.getContacts?CB.getContacts():[])||[]; }
function getClients(){ return (CB.getClients?CB.getClients():[])||[]; }
function clientDisplayName(cl){
  if(cl.relationship_name) return cl.relationship_name;
  if(cl.client_name) return cl.client_name;
  const cs=getContacts();
  const names=(cl.members||[]).map(mid=>{const c=cs.find(x=>x.id===mid);return c?calContactName(c):null;}).filter(Boolean);
  return names.join(' & ')||'Client';
}
// Cath's two standard meeting links (the only ones used)
var MEETING_LINKS={
  cath:{label:"Cath's Room",url:'https://teams.microsoft.com/meet/4855206211068?p=fsRVVo4eEOHQVfIGm5'},
  thrivehq:{label:'ThriveHQ',url:'https://teams.microsoft.com/meet/46980694079511?p=gKZWzjMnOZ0by7IZxu'}
};
function fmt12(h,m){ const ap=h<12?'am':'pm'; let hh=h%12; if(hh===0) hh=12; return hh+(m?':'+(''+m).padStart(2,'0'):'')+ap; }
function fmtWhen(date,time,dur){
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const wd=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const p1=date.split('-').map(Number), p2=time.split(':').map(Number);
  const y=p1[0],mo=p1[1],d=p1[2],hh=p2[0],mm=p2[1];
  const dow=wd[new Date(Date.UTC(y,mo-1,d)).getUTCDay()];
  const em=hh*60+mm+dur, eh=Math.floor(em/60)%24, emin=em%60;
  return dow+', '+d+' '+months[mo-1]+' '+y+', '+fmt12(hh,mm)+'–'+fmt12(eh,emin);
}
// members of a client that have an email, as attendee objects
function clientAttendees(cl){
  const cs=getContacts();
  return (cl.members||[]).map(mid=>cs.find(x=>x.id===mid)).filter(c=>c&&c.email).map(c=>({email:c.email,name:calContactName(c)}));
}

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

// Booking modal — separate searchable Client and Contact pickers
let calBookSel={type:null,id:null};
window.openCalBook=function(presetDate){
  calBookSel={type:null,id:null};
  ['calBookClientSearch','calBookContactSearch'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
  ['calBookClientResults','calBookContactResults'].forEach(id=>{const el=document.getElementById(id); if(el){el.style.display='none'; el.innerHTML='';}});
  document.getElementById('calBookSubject').value='';
  document.getElementById('calBookSource').value='bookings';
  document.getElementById('calBookDuration').value='90';
  document.getElementById('calBookDate').value=(typeof presetDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(presetDate))?presetDate:getAUDateStr();
  document.getElementById('calBookTime').value='10:00';
  document.getElementById('calBookLocation').value='';
  document.getElementById('calBookNotes').value='';
  document.getElementById('calBookMeetingLink').value='';
  document.getElementById('calBookHost').value='Cath Baker';
  document.getElementById('calBookSendConfirm').checked=true;
  const rb=document.getElementById('calBookRecipients'); if(rb) rb.innerHTML='';
  document.getElementById('calBookModal').classList.add('open');
};
// One-tap Focus Session: 60 min on the Work calendar, no link, no attendee.
window.calBookFocus=function(){
  openCalBook();
  document.getElementById('calBookSubject').value='Focus Session';
  document.getElementById('calBookSource').value='work';
  document.getElementById('calBookDuration').value='60';
  document.getElementById('calBookMeetingLink').value='';
  const sc=document.getElementById('calBookSendConfirm'); if(sc) sc.checked=false;
};
// One-tap 1:1 client session: client-facing calendar + Cath's Room link + confirmation on.
// 90 min (standard). Just set date/time and pick the client (title auto-fills on selection).
window.calBookClient=function(presetDate){
  openCalBook(presetDate);
  document.getElementById('calBookSource').value='bookings';
  document.getElementById('calBookDuration').value='90';
  document.getElementById('calBookMeetingLink').value='cath';
  // show the link is attached (submit also enforces this from the dropdown)
  document.getElementById('calBookLocation').value="Microsoft Teams (Cath's Room)";
  const sc=document.getElementById('calBookSendConfirm'); if(sc) sc.checked=true;
};
function clientSearchList(){
  return getClients().filter(cl=>clientAttendees(cl).length)
    .map(cl=>({id:cl.id,name:clientDisplayName(cl),n:clientAttendees(cl).length}))
    .sort((a,b)=>a.name.localeCompare(b.name));
}
function contactSearchList(){
  return getContacts().filter(c=>c.email)
    .map(c=>({id:c.id,name:calContactName(c),email:c.email}))
    .sort((a,b)=>a.name.localeCompare(b.name));
}
window.calBookSearch=function(kind){
  const isClient=kind==='client';
  const q=(document.getElementById(isClient?'calBookClientSearch':'calBookContactSearch').value||'').toLowerCase().trim();
  const box=document.getElementById(isClient?'calBookClientResults':'calBookContactResults');
  // typing a new query clears any prior selection of this kind
  if(calBookSel.type===kind){ calBookSel={type:null,id:null}; calBookApplySelection(); }
  let list=isClient?clientSearchList():contactSearchList();
  if(q) list=list.filter(x=>(x.name+' '+(x.email||'')).toLowerCase().includes(q));
  list=list.slice(0,30);
  if(!list.length){ box.style.display='none'; box.innerHTML=''; return; }
  box.innerHTML=list.map(x=>{
    const sub=isClient?(x.n>1?x.n+' people':'1 person'):emEsc(x.email||'');
    return '<div onclick="calBookPick(\''+kind+'\',\''+x.id+'\')" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:13px;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'#fff\'"><strong>'+emEsc(x.name)+'</strong> <span style="color:#94a3b8;font-size:11px;">'+sub+'</span></div>';
  }).join('');
  box.style.display='block';
};
window.calBookPick=function(kind,id){
  calBookSel={type:kind,id:id};
  if(kind==='client'){
    const cl=getClients().find(x=>x.id===id);
    document.getElementById('calBookClientSearch').value=cl?clientDisplayName(cl):'';
    document.getElementById('calBookContactSearch').value='';
  } else {
    const c=getContacts().find(x=>x.id===id);
    document.getElementById('calBookContactSearch').value=c?calContactName(c):'';
    document.getElementById('calBookClientSearch').value='';
  }
  document.getElementById('calBookClientResults').style.display='none';
  document.getElementById('calBookContactResults').style.display='none';
  calBookApplySelection();
};
function calBookApplySelection(){
  const subj=document.getElementById('calBookSubject');
  let emails=[];
  if(calBookSel.type==='client'){ const cl=getClients().find(x=>x.id===calBookSel.id); if(cl){ emails=clientAttendees(cl).map(a=>a.email); if(!subj.value.trim()) subj.value='Session with '+clientDisplayName(cl); } }
  else if(calBookSel.type==='contact'){ const c=getContacts().find(x=>x.id===calBookSel.id); if(c&&c.email){ emails=[c.email]; if(!subj.value.trim()) subj.value='Session with '+calContactName(c); } }
  const box=document.getElementById('calBookRecipients');
  if(box) box.innerHTML=emails.length?'&#9993; Confirmation will be sent to: '+emails.map(e=>'<strong>'+emEsc(e)+'</strong>').join(', '):'';
}
function getCalEvents(){ return calendarEvents; }
let calEditOrigNotes='';
window.openCalEdit=function(source, graphId){
  const ev=getCalEvents().find(e=>e.source===source && e.graph_event_id===graphId);
  if(!ev){ toast('Could not find that event','error'); return; }
  document.getElementById('calEditOrigSource').value=source;
  document.getElementById('calEditSource').value=source;
  document.getElementById('calEditId').value=graphId;
  document.getElementById('calEditSubject').value=ev.subject||'';
  const d=new Date(ev.start_ts);
  document.getElementById('calEditDate').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney'}).format(d);
  document.getElementById('calEditTime').value=new Intl.DateTimeFormat('en-GB',{timeZone:'Australia/Sydney',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  let dur=90;
  if(ev.start_ts&&ev.end_ts){ dur=Math.max(15,Math.round((new Date(ev.end_ts)-new Date(ev.start_ts))/60000)); }
  const durSel=document.getElementById('calEditDuration');
  if(!Array.prototype.some.call(durSel.options,o=>o.value===(''+dur))){ const o=document.createElement('option'); o.value=dur; o.textContent=dur+' min'; durSel.appendChild(o); }
  durSel.value=''+dur;
  document.getElementById('calEditLocation').value=ev.location||'';
  calEditOrigNotes=ev.body_preview||'';
  document.getElementById('calEditNotes').value=calEditOrigNotes;
  const adEl=document.getElementById('calEditAllDay'); if(adEl){ adEl.checked=!!ev.is_all_day; }
  calEditAllDayToggle();
  document.getElementById('calEditModal').classList.add('open');
};
// All-day toggle: grey out time + duration when it's an all-day event
window.calEditAllDayToggle=function(){
  const on=document.getElementById('calEditAllDay').checked;
  const t=document.getElementById('calEditTime'), d=document.getElementById('calEditDuration');
  if(t){ t.disabled=on; t.style.opacity=on?'.45':'1'; }
  if(d){ d.disabled=on; d.style.opacity=on?'.45':'1'; }
};
// Duplicate an event → opens the Book modal pre-filled with everything so you
// just change the date (and time if needed) and save as a NEW event. Re-selects
// the client/contact so attendees + confirmation carry over.
window.calDuplicateEvent=function(source, graphId){
  const ev=getCalEvents().find(e=>e.source===source && e.graph_event_id===graphId);
  if(!ev){ toast('Could not find that event','error'); return; }
  openCalBook();                                   // resets the modal to defaults
  document.getElementById('calBookSubject').value=ev.subject||'';
  document.getElementById('calBookSource').value=ev.source||'bookings';
  // duration from the original
  let dur=90;
  if(ev.start_ts&&ev.end_ts){ dur=Math.max(15,Math.round((new Date(ev.end_ts)-new Date(ev.start_ts))/60000)); }
  const durSel=document.getElementById('calBookDuration');
  if(!Array.prototype.some.call(durSel.options,o=>o.value===(''+dur))){ const o=document.createElement('option'); o.value=dur; o.textContent=dur+' min'; durSel.appendChild(o); }
  durSel.value=''+dur;
  // keep the SAME start time, default the date to today (clearly needs changing)
  document.getElementById('calBookTime').value=new Intl.DateTimeFormat('en-GB',{timeZone:'Australia/Sydney',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ev.start_ts));
  document.getElementById('calBookDate').value=getAUDateStr();
  document.getElementById('calBookLocation').value=ev.location||'';
  // re-pick the matched client/contact so attendees + the recipient line populate
  const c=calMatchContact(ev);
  if(c){
    const cl=getClients().find(x=>(x.members||[]).indexOf(c.id)>-1 && clientAttendees(x).length);
    if(cl){ window.calBookPick&&window.calBookPick('client',cl.id); }
    else { window.calBookPick&&window.calBookPick('contact',c.id); }
  }
  // preserve the meeting link if the original used Cath's Room / ThriveHQ
  const loc=(ev.location||'').toLowerCase();
  if(loc.indexOf("cath's room")>-1||loc.indexOf('cath')>-1) document.getElementById('calBookMeetingLink').value='cath';
  else if(loc.indexOf('thrivehq')>-1||loc.indexOf('thrive')>-1) document.getElementById('calBookMeetingLink').value='thrivehq';
  toast('Duplicated — pick the new date, then Create','info');
};
window.submitCalEdit=async function(){
  const source=document.getElementById('calEditSource').value;
  const origSource=document.getElementById('calEditOrigSource').value;
  const graphId=document.getElementById('calEditId').value;
  const subject=document.getElementById('calEditSubject').value.trim();
  const date=document.getElementById('calEditDate').value;
  const time=document.getElementById('calEditTime').value;
  const dur=parseInt(document.getElementById('calEditDuration').value,10);
  const location=document.getElementById('calEditLocation').value.trim();
  const notes=document.getElementById('calEditNotes').value;
  const allDay=!!document.getElementById('calEditAllDay').checked;
  if(!subject){ toast('Add a title','error'); return; }
  if(!date){ toast('Pick a date','error'); return; }
  if(!allDay && !time){ toast('Pick a start time','error'); return; }
  let start,end;
  if(allDay){
    // Graph all-day: midnight-to-midnight date-only, end is the NEXT day
    start=date;
    const nd=new Date(date+'T00:00:00Z'); nd.setUTCDate(nd.getUTCDate()+1);
    end=nd.toISOString().slice(0,10);
  } else {
    start=date+'T'+time+':00';
    const endD=new Date(date+'T'+time+':00Z'); endD.setUTCMinutes(endD.getUTCMinutes()+dur);
    end=endD.toISOString().slice(0,19);
  }
  const payload={action:'update',source:source,orig_source:origSource,graph_event_id:graphId,subject:subject,start:start,end:end,timeZone:'Australia/Sydney',location:location,is_all_day:allDay};
  // only send body if the notes actually changed — avoids clobbering the full body with the truncated preview
  if(notes!==calEditOrigNotes){ payload.body=notes?emEsc(notes).replace(/\n/g,'<br>'):''; }
  const btn=document.getElementById('calEditSubmitBtn'); btn.disabled=true; btn.textContent='Saving…';
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) throw new Error('Not signed in');
    const res=await fetch(`${SUPABASE_EDGE_URL}/ms-graph-calendar`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify(payload)});
    const out=await res.json();
    if(!res.ok) throw new Error(out.error||('HTTP '+res.status));
    closeModal('calEditModal');
    await loadCalendarEvents(); renderCalWeek();
    toast(out.moved?'Event moved & updated':'Event updated','success');
  }catch(e){ toast('Update failed: '+e.message,'error'); }
  finally{ btn.disabled=false; btn.textContent='Save changes'; }
};
window.calDeleteEvent=async function(source, graphId){
  if(!graphId){ toast('Cannot delete: missing event id','error'); return; }
  if(!confirm('Delete this event? It will be removed from your Outlook calendar. This cannot be undone.')) return;
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) throw new Error('Not signed in');
    const res=await fetch(`${SUPABASE_EDGE_URL}/ms-graph-calendar`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({action:'cancel',source:source,graph_event_id:graphId})});
    const out=await res.json();
    if(!res.ok) throw new Error(out.error||('HTTP '+res.status));
    toast('Event deleted','success');
    await loadCalendarEvents(); renderCalWeek();
  }catch(e){ toast('Delete failed: '+e.message,'error'); }
};
window.submitCalBook=async function(){
  const subject=document.getElementById('calBookSubject').value.trim();
  const source=document.getElementById('calBookSource').value;
  const date=document.getElementById('calBookDate').value;
  const time=document.getElementById('calBookTime').value;
  const dur=parseInt(document.getElementById('calBookDuration').value,10);
  const location=document.getElementById('calBookLocation').value.trim();
  const mlKey=document.getElementById('calBookMeetingLink').value;
  const notes=document.getElementById('calBookNotes').value.trim();
  if(!subject){ toast('Add a title','error'); return; }
  if(!date||!time){ toast('Pick a date and start time','error'); return; }
  // naive Sydney wall-clock; the function passes timeZone Australia/Sydney to Graph
  const start=date+'T'+time+':00';
  const endD=new Date(date+'T'+time+':00Z'); endD.setUTCMinutes(endD.getUTCMinutes()+dur);
  const end=endD.toISOString().slice(0,19);
  // recipients: a client invites all its members; a contact invites just them
  let attendees=[], contactId=undefined, clientId=undefined;
  if(calBookSel.type==='client'){
    const cl=getClients().find(x=>x.id===calBookSel.id);
    if(cl){ clientId=cl.id; attendees=clientAttendees(cl); }
  } else if(calBookSel.type==='contact'){
    const c=getContacts().find(x=>x.id===calBookSel.id);
    if(c&&c.email){ attendees=[{email:c.email,name:calContactName(c)}]; contactId=c.id; }
  }
  // meeting link → clickable join link in the body + sensible location label
  const ml=MEETING_LINKS[mlKey];
  let loc=location;
  let bodyHtml='';
  if(ml){
    bodyHtml='<p>Join the session here: <a href="'+ml.url+'">'+ml.url+'</a></p>';
    // a meeting link is found → Teams is the location (overrides any typed location)
    loc='Microsoft Teams ('+ml.label+')';
  }
  if(notes) bodyHtml+=(bodyHtml?'<br>':'')+emEsc(notes).replace(/\n/g,'<br>');
  const sendConfirm=document.getElementById('calBookSendConfirm').checked && attendees.length>0;
  const host=(document.getElementById('calBookHost').value||'').trim()||'Cath Baker';
  const whenText=fmtWhen(date,time,dur);
  const btn=document.getElementById('calBookSubmitBtn'); btn.disabled=true; btn.textContent='Creating…';
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) throw new Error('Not signed in');
    const res=await fetch(`${SUPABASE_EDGE_URL}/ms-graph-calendar`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({
      action:'book', source, subject, start, end, timeZone:'Australia/Sydney',
      location: loc||undefined, body:bodyHtml||undefined,
      attendees, contact_id: contactId||undefined, client_id: clientId||undefined,
      send_confirmation:sendConfirm, when_text:whenText, host:host, meeting_url: ml?ml.url:undefined
    })});
    const out=await res.json();
    if(!res.ok) throw new Error(out.error||('HTTP '+res.status));
    closeModal('calBookModal');
    await loadCalendarEvents(); renderCalWeek();
    if(out.confirmation_error) toast('Booked, but confirmation email failed: '+out.confirmation_error,'error');
    else toast(out.confirmation_sent?'Appointment booked & client emailed':'Appointment booked','success');
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

// Contact modal Links & Status block — read-only summary of every link a contact has
function getProspects(){ return (CB.getProspects?CB.getProspects():[])||[]; }
function getReferrals(){ return (CB.getReferrals?CB.getReferrals():[])||[]; }
window.renderContactLinksSection=function(c){
  var el=document.getElementById('cLinksSection'); if(!el) return;
  if(!c){ el.style.display='none'; el.innerHTML=''; return; }
  var prosp=getProspects().find(function(p){return p.contact_id===c.id;});
  var lcs=getClients().filter(function(cl){return (cl.members||[]).indexOf(c.id)>-1;});
  var thq=lcs.find(function(cl){return cl.role==='Community';});
  var refs=getReferrals();
  var refId=null, refSrc=null;
  if(prosp&&prosp.referrer_id){ refId=prosp.referrer_id; refSrc='prospect'; }
  if(!refId){ var x=lcs.find(function(y){return y.referred_by;}); if(x){ refId=x.referred_by; refSrc='client'; } }
  if(!refId){ var rm=refs.find(function(r){return (r.members||[]).indexOf(c.id)>-1;}); if(rm){ refId=rm.id; refSrc='direct link'; } }
  var refRow=refId?refs.find(function(r){return r.id===refId;}):null;
  function pill(bg,fg,txt,oc){ return '<span '+(oc?'onclick="event.stopPropagation();'+oc+'" ':'')+'class="cl-pill" style="background:'+bg+';color:'+fg+';'+(oc?'cursor:pointer':'')+'">'+txt+'</span>'; }
  function mk(t,b){ return '<div class="cl-row"><span class="cl-lbl">'+t+'</span><div class="cl-fx">'+b+'</div></div>'; }
  var rows=[];
  if(prosp) rows.push(mk('Prospect', pill('#fef3c7','#92400e',prosp.name,"closeModal('contactModal');navTo('prospects');setTimeout(function(){openProspectModal('"+prosp.id+"')},100)")+pill('#f1f5f9','#475569',prosp.status||'New')));
  if(lcs.length){
    var cp=lcs.map(function(cl){
      var mr=cl.memberRoles&&cl.memberRoles[c.id]||'';
      var lbl=cl.relationship_name+' <span style="opacity:.7;font-weight:500;">('+cl.role+(mr&&mr!=='Client'?' · '+mr:'')+')</span>';
      var bg=cl.status==='Active'?'#dcfce7':cl.status==='On Hold'?'#fef3c7':'#f1f5f9';
      var fg=cl.status==='Active'?'#15803d':cl.status==='On Hold'?'#92400e':'#475569';
      return pill(bg,fg,lbl,"closeModal('contactModal');setTimeout(function(){openClientProfile('"+cl.id+"')},100)");
    }).join(' ');
    rows.push(mk('Linked Clients',cp));
  }
  if(thq){
    var s=c.membership_start_date?' since '+c.membership_start_date:'';
    var r=c.renewal_date?', renewal '+c.renewal_date:'';
    var od=c.renewal_date&&new Date(c.renewal_date)<new Date();
    rows.push('<div class="cl-row"><span class="cl-lbl">ThriveHQ Member</span><div style="font-size:12px;color:#1e3a5f;">&#127793; ThriveHQ member'+s+r+(od?' <span style="color:#dc2626;font-weight:600;">(OVERDUE)</span>':'')+'</div></div>');
  }
  if(refRow) rows.push(mk('Referred By', pill('#dbeafe','#1d4ed8',refRow.name,"closeModal('contactModal');navTo('referrals');setTimeout(function(){openReferralModal('"+refRow.id+"')},100)")+'<span style="font-size:10px;color:#94a3b8;">via '+refSrc+'</span>'));
  else if(c.referrer) rows.push('<div class="cl-row"><span class="cl-lbl">Referred By (legacy)</span><div style="font-size:12px;color:#64748b;">'+c.referrer+' <span style="font-size:10px;color:#94a3b8;">— not yet linked to a referrer record</span></div></div>');
  if(!rows.length){ el.style.display='none'; el.innerHTML=''; return; }
  el.style.display='block';
  el.innerHTML='<div style="font-size:11px;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">Links &amp; Status</div>'+rows.join('')+'<div style="font-size:10px;color:#94a3b8;margin-top:4px;">Edit links from the Prospect, Client, or Referrer record.</div>';
};

// ════════════════════════════════════════════════════════════════════════
// Calendar render layer — moved here from index.html (file-size headroom)
// ════════════════════════════════════════════════════════════════════════
let calendarEvents=[];
let calTableMissing=false;
let calWeekOffset=0;
let calView=(localStorage.getItem('cal_view')||'agenda');           // 'agenda' | 'grid'
let calLastSynced=null;
let calCatFilter=localStorage.getItem('cal_cat')||'';   // '' = show all; else isolate one category
const CAL_SELF_EMAILS=['cath@coach4u.com.au','cath@coachingwithcath.com.au','coach4u@netorgft4053847.onmicrosoft.com'];
// Five mutually-exclusive categories — every event resolves to exactly one.
// Focus & ThriveHQ are detected by title (both are Work-calendar functions);
// Appointments = booked via the client link; Personal = personal calendar; Work = the rest.
const CAL_CATS={
  appointment:{color:'#2563eb',label:'Appointments'},
  focus:{color:'#ea580c',label:'Focus Sessions'},
  thrive:{color:'#ea580c',label:'ThriveHQ'},
  personal:{color:'#7c3aed',label:'Personal'},
  work:{color:'#0d9488',label:'Work'}
};
function calEventCategory(ev){
  const s=(ev.subject||'').toLowerCase();
  if(s.indexOf('focushq')>-1||s.indexOf('focus hq')>-1||s.indexOf('focus session')>-1) return 'focus';
  if(s.indexOf('thrivehq')>-1||s.indexOf('thrive hq')>-1) return 'thrive';
  if(ev.source==='bookings') return 'appointment';
  if(ev.source==='personal') return 'personal';
  return 'work';
}
function calCatMeta(ev){ return CAL_CATS[calEventCategory(ev)]||CAL_CATS.work; }
function calEventColor(ev){ return calCatMeta(ev).color; }
function calLocLabel(loc){ if(!loc) return ''; return /teams\.microsoft\.com/i.test(loc)?'Microsoft Teams':(''+loc).replace(/</g,'&lt;').slice(0,60); }
async function loadCalendarEvents(){
  calTableMissing=false;
  try{
    const {data,error}=await supabase.from('calendar_events').select('*').order('start_ts');
    if(error){
      if(error.code==='42P01'){ calTableMissing=true; }
      else { console.warn('Load calendar_events error:',error); }
      calendarEvents=[];
      return;
    }
    calendarEvents=data||[];
    // newest last_synced across rows = snapshot freshness
    calLastSynced=calendarEvents.reduce((m,e)=>{const t=e.last_synced||e.created_at;return t&&(!m||t>m)?t:m;},null);
  }catch(e){ console.warn('loadCalendarEvents failed:',e); calendarEvents=[]; }
}
function calSydneyDateKey(iso){
  try{ return new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney'}).format(new Date(iso)); }
  catch(e){ return ''; }
}
function calFmtTime(iso){
  try{ return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(iso)).replace(/\s/g,'').toLowerCase(); }
  catch(e){ return ''; }
}
function calFmtDuration(ev){
  if(ev.is_all_day) return 'All day';
  if(!ev.end_ts) return calFmtTime(ev.start_ts);
  return calFmtTime(ev.start_ts)+' – '+calFmtTime(ev.end_ts);
}
function calContactName(c){
  return ((c.first_name||'')+' '+(c.last_name||'')).trim()||c.email||'Contact';
}
function calMatchContact(ev){
  if(ev.contact_id){ const c=getContacts().find(x=>x.id===ev.contact_id); if(c) return c; }
  let a=ev.attendees, emails=[];
  if(typeof a==='string'){ try{ a=JSON.parse(a); }catch(e){ a=[a]; } }
  if(Array.isArray(a)){
    a.forEach(x=>{
      if(typeof x==='string') emails.push(x);
      else if(x&&x.email) emails.push(x.email);
      else if(x&&x.emailAddress&&x.emailAddress.address) emails.push(x.emailAddress.address);
    });
  }
  emails=emails.map(e=>(''+e).toLowerCase().trim()).filter(e=>e&&!CAL_SELF_EMAILS.includes(e));
  if(!emails.length) return null;
  return getContacts().find(c=>c.email&&emails.includes(c.email.toLowerCase().trim()))||null;
}
function calMonday(offsetWeeks){
  const todayStr=getAUDateStr();
  const d=new Date(todayStr+'T12:00:00');
  const dow=(d.getDay()+6)%7;
  d.setDate(d.getDate()-dow+(offsetWeeks||0)*7);
  return d;
}
function calVisibleEvents(){
  const vis=calCatFilter?calendarEvents.filter(e=>calEventCategory(e)===calCatFilter):calendarEvents.slice();
  // De-duplicate the same appointment that exists in more than one calendar
  // (e.g. a Bookings session that also lands on the Work calendar) — keep one,
  // preferring Bookings so a client appointment reads as a blue Appointment (not
  // its green Work duplicate). Personal next, Work last.
  const rank=function(s){ return s==='bookings'?0:(s==='personal'?1:2); };
  const byUid={}, singles=[];
  vis.forEach(e=>{
    if(!e.ical_uid){ singles.push(e); return; }
    const cur=byUid[e.ical_uid];
    if(!cur||rank(e.source)<rank(cur.source)) byUid[e.ical_uid]=e;
  });
  return singles.concat(Object.keys(byUid).map(k=>byUid[k]));
}
window.calNav=function(delta){ calWeekOffset+=delta; renderCalWeek(); };
window.calToday=function(){ calWeekOffset=0; renderCalWeek(); };
window.calSetView=function(v){ calView=v; try{localStorage.setItem('cal_view',v);}catch(e){} renderCalWeek(); };
window.calSetCat=function(cat){ calCatFilter=(calCatFilter===cat)?'':cat; try{localStorage.setItem('cal_cat',calCatFilter);}catch(e){} renderCalWeek(); };
window.calRefresh=async function(){ toast('Refreshing calendar…','info'); await loadCalendarEvents(); renderCalWeek(); toast('Calendar refreshed','success'); };
// Calendar + client-email MS-Graph UI moved to ms-graph-ui.js (file-size limit)

function calRelLastSynced(){
  if(!calLastSynced) return '';
  const diff=Date.now()-new Date(calLastSynced).getTime();
  const mins=Math.round(diff/60000), hrs=Math.round(mins/60), days=Math.round(hrs/24);
  if(mins<60) return mins<=1?'just now':mins+' min ago';
  if(hrs<24) return hrs+(hrs===1?' hour ago':' hours ago');
  return days+(days===1?' day ago':' days ago');
}

function calEventHTML_grid(ev){
  const col=calEventColor(ev);
  const c=calMatchContact(ev);
  const subj=(ev.subject||'(no title)').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let h='<div class="cal-ev'+(ev.is_all_day?' allday':'')+'" style="border-left-color:'+col+';background:'+col+'16;position:relative;">';
  if(ev.graph_event_id){
    h+='<button onclick="calDuplicateEvent(\''+ev.source+'\',\''+ev.graph_event_id+'\')" title="Duplicate to a new date" style="position:absolute;top:2px;right:42px;background:rgba(255,255,255,.9);border:1px solid #cbd5e1;color:#475569;border-radius:4px;font-size:11px;line-height:1;padding:1px 5px;cursor:pointer;">&#10697;</button>';
    h+='<button onclick="openCalEdit(\''+ev.source+'\',\''+ev.graph_event_id+'\')" title="Edit this event" style="position:absolute;top:2px;right:22px;background:rgba(255,255,255,.9);border:1px solid #cbd5e1;color:#475569;border-radius:4px;font-size:11px;line-height:1;padding:1px 5px;cursor:pointer;">&#9998;</button>';
    h+='<button onclick="calDeleteEvent(\''+ev.source+'\',\''+ev.graph_event_id+'\')" title="Delete this event" style="position:absolute;top:2px;right:2px;background:rgba(255,255,255,.9);border:1px solid #fecaca;color:#dc2626;border-radius:4px;font-size:12px;line-height:1;padding:1px 5px;cursor:pointer;">&times;</button>';
  }
  h+='<div class="evtime">'+calFmtDuration(ev)+(ev.is_all_day?' · <span style="color:#64748b;">Free</span>':'')+'</div>';
  h+='<div class="evt">'+subj+'</div>';
  if(ev.location){ h+='<div class="evm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+calLocLabel(ev.location)+'</div>'; }
  const gnm=calApptClientName(ev);
  if(gnm && gnm!==(ev.subject||'')){ h+='<div class="evpill">'+gnm.replace(/</g,'&lt;')+'</div>'; }
  h+='</div>';
  return h;
}
function calEventHTML_agenda(ev){
  const col=calEventColor(ev);
  const meta=calCatMeta(ev);
  const c=calMatchContact(ev);
  const subj=(ev.subject||'(no title)').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let h='<div class="cal-ag-ev'+(ev.is_all_day?' allday':'')+'" style="border-left-color:'+col+';background:'+col+'12">';
  h+='<div class="agtime">'+calFmtDuration(ev)+'</div>';
  h+='<div class="agmain"><div class="agtitle">'+subj
    +'<span class="agtag" style="background:'+meta.color+'22;color:'+meta.color+'">'+meta.label+'</span>'
    +(ev.is_all_day?'<span class="agtag" style="background:#f1f5f9;color:#64748b;">Free</span>':'')
    +((()=>{const n=calApptClientName(ev);return (n&&n!==(ev.subject||''))?'<span class="agpill">'+n.replace(/</g,'&lt;')+'</span>':'';})())+'</div>';
  if(ev.location){ h+='<div class="agmeta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+calLocLabel(ev.location)+'</div>'; }
  h+='</div>';
  if(ev.graph_event_id){
    h+='<button onclick="calDuplicateEvent(\''+ev.source+'\',\''+ev.graph_event_id+'\')" title="Duplicate to a new date" style="margin-left:auto;align-self:center;background:#fff;border:1px solid #cbd5e1;color:#475569;border-radius:6px;padding:4px 9px;font-size:11px;font-weight:600;cursor:pointer;flex-shrink:0;">Duplicate</button>';
    h+='<button onclick="openCalEdit(\''+ev.source+'\',\''+ev.graph_event_id+'\')" title="Edit this event" style="margin-left:6px;align-self:center;background:#fff;border:1px solid #cbd5e1;color:#475569;border-radius:6px;padding:4px 9px;font-size:11px;font-weight:600;cursor:pointer;flex-shrink:0;">Edit</button>';
    h+='<button onclick="calDeleteEvent(\''+ev.source+'\',\''+ev.graph_event_id+'\')" title="Delete this event" style="margin-left:6px;align-self:center;background:#fff;border:1px solid #fecaca;color:#dc2626;border-radius:6px;padding:4px 9px;font-size:11px;font-weight:600;cursor:pointer;flex-shrink:0;">Delete</button>';
  }
  h+='</div>';
  return h;
}

// Upcoming client appointments — flat list across all future weeks, sorted by
// soonest, showing the client name prominently. Lets Cath see who's coming up
// without paging week-by-week. Collapsible; state remembered.
function calDayLabel(iso){
  try{ return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',weekday:'short',day:'numeric',month:'short'}).format(new Date(iso)); }
  catch(e){ return ''; }
}
// Best client name for an appointment: a matched contact wins; otherwise parse
// the title ("… with Cath - Deb and Chris Walton" / "Session with Steven Sullivan").
function calApptClientName(ev){
  const c=calMatchContact(ev);
  if(c) return calContactName(c);
  let t=(ev.subject||'').trim();
  if(t.indexOf(' - ')>-1){ const a=t.split(' - ').pop().trim(); if(a) return a; }
  const m=t.match(/\bwith\s+(.+)$/i);
  if(m){ let n=m[1].trim(); if(n && !/^cath\b/i.test(n)) return n; }
  return t||'Client';
}
// Upcoming client appointments = future, non-all-day events on the Bookings
// calendar (the blue "Appointment" category). This is the reliable signal —
// not attendee-email matching, which both missed title-only sessions and let
// non-client contacts through. De-dup by ical_uid (Bookings already preferred).
window.calUpcomingAppointments=function(){
  const todayKey=getAUDateStr();
  const byUid={}, singles=[];
  calendarEvents.forEach(ev=>{
    if(ev.is_all_day || !ev.start_ts) return;
    if(calSydneyDateKey(ev.start_ts)<todayKey) return;
    if(calEventCategory(ev)!=='appointment') return;            // Bookings calendar only
    if(!ev.ical_uid){ singles.push(ev); return; }
    if(!byUid[ev.ical_uid]) byUid[ev.ical_uid]=ev;
  });
  return singles.concat(Object.keys(byUid).map(k=>byUid[k]))
    .sort((a,b)=>(a.start_ts||'').localeCompare(b.start_ts||''))
    .map(ev=>({start_ts:ev.start_ts,date:calDayLabel(ev.start_ts),
      time:ev.end_ts?(calFmtTime(ev.start_ts)+' – '+calFmtTime(ev.end_ts)):calFmtTime(ev.start_ts),
      name:calApptClientName(ev),subject:ev.subject||'',color:calEventColor(ev),
      source:ev.source,graph_event_id:ev.graph_event_id||''}));
};

function renderCalWeek(){
  const el=document.getElementById('calWeekContent');
  if(!el) return;
  const monday=calMonday(calWeekOffset);
  const days=[];
  for(let i=0;i<7;i++){ const dd=new Date(monday); dd.setDate(monday.getDate()+i); days.push(dd); }
  const todayKey=getAUDateStr();
  const fmtRange=(d)=>new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short'}).format(d);
  const yr=days[6].getFullYear();
  const rangeLabel=fmtRange(days[0])+' – '+fmtRange(days[6])+' '+yr;

  const vis=calVisibleEvents();
  const byDay={};
  days.forEach(d=>{ byDay[calSydneyDateKey(d.toISOString())]=[]; });
  vis.forEach(ev=>{ const k=calSydneyDateKey(ev.start_ts); if(byDay[k]) byDay[k].push(ev); });
  Object.keys(byDay).forEach(k=>{
    byDay[k].sort((a,b)=>{
      if(a.is_all_day&&!b.is_all_day) return -1;
      if(!a.is_all_day&&b.is_all_day) return 1;
      return (a.start_ts||'').localeCompare(b.start_ts||'');
    });
  });

  const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let html='';

  // toolbar — tap a category pill to isolate it; tap again or "All" to reset
  const catPill=function(cat){
    const m=CAL_CATS[cat];
    const active=calCatFilter===cat;
    const dim=calCatFilter&&!active?'opacity:.4;':'';
    const sty=active?'background:'+m.color+';color:#fff;border-color:'+m.color+';font-weight:700;':'border-color:'+m.color+'55;'+dim;
    return '<span class="cal-chip" onclick="calSetCat(\''+cat+'\')" style="font-size:11px;'+sty+'"><span class="cal-dot" style="background:'+(active?'#fff':m.color)+'"></span>'+m.label+'</span>';
  };
  const allPill='<span class="cal-chip" onclick="calSetCat(\'\')" style="font-size:11px;'+(calCatFilter?'':'background:#1e3a5f;color:#fff;border-color:#1e3a5f;font-weight:700;')+'">All</span>';
  html+='<div class="cal-toolbar">'
    +'<button class="cal-nav-btn" onclick="calNav(-1)">&#8249;</button>'
    +'<button class="cal-nav-btn cal-today-btn" onclick="calToday()">Today</button>'
    +'<button class="cal-nav-btn" onclick="calNav(1)">&#8250;</button>'
    +'<button class="cal-nav-btn" onclick="openCalBook()" title="Full booking form">+ Book</button>'
    +'<button class="cal-nav-btn" onclick="calBookClient()" style="background:#2563eb;color:#fff;border-color:#2563eb;" title="Quick-book a 1:1 client session — Cath\'s Room link, just pick the client">+ Client</button>'
    +'<button class="cal-nav-btn" onclick="calBookFocus()" style="background:#ea580c;color:#fff;border-color:#ea580c;" title="Quick-book a 60 min Focus Session">+ Focus</button>'
    +'<span class="cal-week-range">'+rangeLabel+(calWeekOffset===0?' · This week':'')+'</span>'
    +'<span class="cal-viewtoggle" style="margin-left:auto;">'
      +'<button class="'+(calView==='agenda'?'active':'')+'" onclick="calSetView(\'agenda\')">Agenda</button>'
      +'<button class="'+(calView==='grid'?'active':'')+'" onclick="calSetView(\'grid\')">Grid</button>'
    +'</span>'
    +'<button class="cal-nav-btn" id="calSyncBtn" onclick="calSyncNow()" title="Pull the latest from Outlook" style="font-size:11px;padding:4px 9px;color:#64748b;">&#8635; Sync</button>'
  +'</div>';
  html+='<div class="cal-filters" style="margin-bottom:12px;">'+allPill
    +catPill('appointment')+catPill('focus')+catPill('thrive')+catPill('work')+catPill('personal')+'</div>';

  // snapshot banner
  if(calTableMissing){
    html+='<div class="cal-banner warn"><span>&#9888;</span><span><strong>Calendar sync not set up yet.</strong> The <code>calendar_events</code> table doesn\'t exist in Supabase yet.</span></div>';
  } else if(calendarEvents.length===0){
    html+='<div class="cal-banner warn"><span>&#9888;</span><span><strong>No events synced yet.</strong> Ask your VA (in a chat session) to sync your Outlook calendars and they\'ll appear here.</span></div>';
  } else {
    html+='<div class="cal-banner"><span>&#128257;</span><span><strong>Snapshot view.</strong> Last synced '+(calRelLastSynced()||'recently')+'. This is a saved copy — new Outlook changes appear after a sync. Live auto-sync is coming in a later phase.</span></div>';
  }

  // (summary count strip removed — not needed)

  if(calView==='agenda'){
    html+='<div class="cal-agenda">';
    days.forEach((d,i)=>{
      const k=calSydneyDateKey(d.toISOString());
      const isToday=k===todayKey;
      const evs=byDay[k]||[];
      html+='<div class="cal-ag-day'+(isToday?' today':'')+(evs.length?'':' empty')+'">';
      html+='<div class="cal-ag-date"><span class="dow">'+dayNames[i]+'</span><span class="dbig">'+d.getDate()+'</span> '
        +new Intl.DateTimeFormat('en-AU',{month:'short'}).format(d)+(isToday?' · Today':'')
        +'<button class="cal-addbtn" onclick="openCalBook(\''+k+'\')" title="Book on this day">+ Add</button></div>';
      html+='<div class="cal-ag-events">';
      if(!evs.length){ html+='<div class="cal-ag-none" onclick="openCalBook(\''+k+'\')" style="cursor:pointer;">Nothing scheduled — tap to book</div>'; }
      else { evs.forEach(ev=>{ html+=calEventHTML_agenda(ev); }); }
      html+='</div></div>';
    });
    html+='</div>';
  } else {
    html+='<div class="cal-week-grid">';
    days.forEach((d,i)=>{
      const k=calSydneyDateKey(d.toISOString());
      const isToday=k===todayKey;
      const isWeekend=i>=5;
      const evs=byDay[k]||[];
      html+='<div class="cal-day'+(isToday?' today':'')+(isWeekend?' weekend':'')+'">';
      html+='<div class="cal-day-head"><span>'+dayNames[i]+'</span><span class="dnum">'+d.getDate()
        +'<button class="cal-addbtn mini" onclick="openCalBook(\''+k+'\')" title="Book on this day">+</button></span></div>';
      html+='<div class="cal-day-body">';
      if(!evs.length){ html+='<div class="cal-empty" onclick="openCalBook(\''+k+'\')" style="cursor:pointer;" title="Book on this day">+ Add</div>'; }
      else { evs.forEach(ev=>{ html+=calEventHTML_grid(ev); }); }
      html+='</div></div>';
    });
    html+='</div>';
  }
  el.innerHTML=html;
}

// ── expose calendar entry points to the inline app (CB bridge reversed) ──
window.loadCalendarEvents=loadCalendarEvents;
window.renderCalWeek=renderCalWeek;
// Quick Hub feed: upcoming client appointments (delegates to calUpcomingAppointments)
window.calUpcomingForHub=function(limit){ return window.calUpcomingAppointments().slice(0,limit||8); };

})();
