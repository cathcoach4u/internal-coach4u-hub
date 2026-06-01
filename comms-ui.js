// comms-ui.js — Coach4U Comms (SMS / WhatsApp / Email) UI + data layer
// Extracted from index.html to free headroom under the 1 MiB push ceiling.
// Supabase/Twilio-backed (NOT MS-Graph — that's ms-graph-ui.js). The main app
// runs inside an IIFE; this file gets what it needs via window.CB (the bridge):
// sb, EDGE, toast, navTo, copyText, getContacts(), getClients(). It exposes back
// loadSmsMessages / loadCommsLists / loadGroupTemplates / processStopReplies /
// startCommsRealtime / renderSms / resetCommsUnread / getSmsMessages and all the
// window.* onclick handlers. A syntax error here can't break the main app.
(function(){
'use strict';
var CB=window.CB||{};
var supabase=CB.sb, SUPABASE_EDGE_URL=CB.EDGE, toast=CB.toast, copyText=CB.copyText||window.copyText;
function navTo(t){ return window.navTo&&window.navTo(t); }
function getContacts(){ return (CB.getContacts?CB.getContacts():[])||[]; }
function getClients(){ return (CB.getClients?CB.getClients():[])||[]; }

// ── comms state (was module-level in index.html) ──
let smsMessages = [];
let smsSelectedContactId = null;
let smsChannelFilter = 'all'; // 'all' | 'sms' | 'whatsapp' | 'email'
let commsLockedChannel = null; // when set ('sms'|'whatsapp'|'email'), the screen is locked to one channel (per-channel pages)
window.setSmsChannelFilter=function(ch){smsChannelFilter=ch;renderSms();};
// Per-channel page entry: lock the whole screen to one channel and render.
// Called from navTo('sms'|'whatsapp'|'email'). channel=null → legacy all-channels view.
window.openCommsChannel=function(channel){
  commsLockedChannel=(channel==='sms'||channel==='whatsapp'||channel==='email')?channel:null;
  if(commsLockedChannel){
    smsChannelFilter=commsLockedChannel;
    window._commsChannel=commsLockedChannel;
    groupSendChannel=commsLockedChannel;
  }
  renderSms();
};
let commsLists = [];
let commsListMembers = [];
let commsView = 'contacts'; // 'contacts' | 'groups'
let commsActiveListId = null; // null | 'thrivehq' | UUID | 'new'
let groupSendChannel = 'sms'; // 'sms' | 'whatsapp' | 'email'
let groupTemplatesCache={};

async function loadSmsMessages(){
  const {data,error}=await supabase.from('sms_messages').select('*').order('created_at',{ascending:true});
  if(data) smsMessages=data;
  if(error&&error.code!=='42P01') console.error('loadSmsMessages:',error);
}

async function processStopReplies(){
  const stopIds=[...new Set(smsMessages
    .filter(m=>m.direction==='inbound'&&m.body?.trim().toUpperCase()==='STOP'&&m.contact_id)
    .map(m=>m.contact_id))];
  const toOptOut=stopIds.filter(id=>{const c=getContacts().find(x=>x.id===id);return c&&!c.sms_opted_out;});
  if(!toOptOut.length) return;
  await supabase.from('contacts').update({sms_opted_out:true}).in('id',toOptOut);
  toOptOut.forEach(id=>{const c=getContacts().find(x=>x.id===id);if(c) c.sms_opted_out=true;});
  toast(`${toOptOut.length} contact${toOptOut.length!==1?'s':''} auto-opted out (replied STOP)`,'info');
}

let _commsRealtimeChannel=null;
let commsUnreadCount=0;

function updateCommsBadge(){
  const badge=document.getElementById('commsUnreadBadge');
  if(!badge) return;
  if(commsUnreadCount>0){
    badge.textContent=commsUnreadCount;
    badge.style.display='inline-block';
  } else {
    badge.style.display='none';
  }
}

function startCommsRealtime(){
  if(_commsRealtimeChannel) return;
  _commsRealtimeChannel=supabase
    .channel('comms-inbox')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'sms_messages'},payload=>{
      const msg=payload.new;
      if(!msg||!msg.id) return;
      if(smsMessages.some(m=>m.id===msg.id)) return;
      smsMessages.push(msg);
      if(msg.direction==='inbound'&&msg.body?.trim().toUpperCase()==='STOP'&&msg.contact_id){
        const c=getContacts().find(x=>x.id===msg.contact_id);
        if(c&&!c.sms_opted_out){
          supabase.from('contacts').update({sms_opted_out:true}).eq('id',c.id).then(()=>{
            c.sms_opted_out=true;
            toast(`${c.first_name||'Contact'} replied STOP — auto-opted out of SMS`,'info');
            renderSms();
          });
        }
      }
      const isOpen=msg.contact_id===smsSelectedContactId&&document.getElementById('screen-sms')?.style.display!=='none';
      if(isOpen){
        const thread=document.getElementById('smsThread');
        if(thread){
          thread.innerHTML=renderCommsThread(smsSelectedContactId,smsChannelFilter);
          thread.scrollTop=thread.scrollHeight;
        }
      } else {
        const contact=getContacts().find(c=>c.id===msg.contact_id);
        const name=contact?(contact.first_name||'')+' '+(contact.last_name||''):'Someone';
        toast(`New message from ${name.trim()}: ${msg.body.slice(0,50)}${msg.body.length>50?'…':''}`, 'info', 10000);
        commsUnreadCount++;
        updateCommsBadge();
      }
      renderSmsContactList();
    })
    .subscribe();
}

function chPill(ch){
  if(ch==='whatsapp') return '<span style="font-size:9px;background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:99px;font-weight:700;margin-left:4px;">WA</span>';
  if(ch==='email')    return '<span style="font-size:9px;background:#ffedd5;color:#c2410c;padding:1px 6px;border-radius:99px;font-weight:700;margin-left:4px;">Email</span>';
  return '<span style="font-size:9px;background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:99px;font-weight:700;margin-left:4px;">SMS</span>';
}

function renderCommsThread(contactId, channelFilter){
  const msgs=smsMessages.filter(m=>m.contact_id===contactId&&(channelFilter==='all'||m.channel===channelFilter));
  if(!msgs.length) return '<div style="text-align:center;color:#94a3b8;font-size:13px;padding:24px 0;">No messages yet</div>';
  return msgs.map(m=>{
    const out=m.direction==='outbound';
    const time=new Date(m.created_at).toLocaleString('en-AU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    const ch=m.channel||'sms';
    const subjectLine=ch==='email'&&m.subject?`<div style="font-size:11px;font-weight:700;opacity:.75;margin-bottom:4px;">&#128140; ${m.subject.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>`:'';
    const dirLabel=out
      ? `<div style="font-size:10px;color:#94a3b8;text-align:right;margin-bottom:2px;">Sent</div>`
      : `<div style="font-size:10px;color:#94a3b8;text-align:left;margin-bottom:2px;">Received</div>`;
    return `<div style="display:flex;flex-direction:column;align-items:${out?'flex-end':'flex-start'};margin-bottom:10px;">
      ${dirLabel}
      <div style="max-width:76%;background:${out?'#1e3a5f':'#e8f4ff'};color:${out?'#fff':'#1e293b'};border:${out?'none':'1px solid #bfdbfe'};border-radius:${out?'12px 12px 4px 12px':'12px 12px 12px 4px'};padding:9px 13px;font-size:13px;line-height:1.5;">
        ${subjectLine}${m.body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}
        <div style="font-size:10px;opacity:.6;margin-top:4px;text-align:right;">${chPill(ch)} ${time}</div>
      </div>
    </div>`;
  }).join('');
}

function _commsChannelBtn(id,ch,label,activeCh){
  const colors={sms:'#1d4ed8',whatsapp:'#15803d',email:'#c2410c'};
  const ac=colors[ch]||'#1e3a5f';
  const active=activeCh===ch;
  return `<button id="_chbtn_${id}_${ch}" onclick="window._setCommsChannel('${id}','${ch}')" style="flex:1;padding:6px 4px;border:1px solid #e2e8f0;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;background:${active?ac:'#f8fafc'};color:${active?'#fff':'#374151'};">${label}</button>`;
}

window._updateCharCount=function(composeId){
  const ta=document.getElementById(composeId);
  const cc=document.getElementById('_cc_'+composeId);
  if(!ta||!cc) return;
  const ch=window._commsChannel||'sms';
  if(ch!=='sms'){cc.style.display='none';return;}
  const len=ta.value.length;
  const segments=len===0?1:Math.ceil(len/160);
  cc.style.display='block';
  cc.textContent=`${len} char${len!==1?'s':''} · ${segments} SMS${segments>1?' ('+segments+'×)':''}`;
  cc.style.color=len>320?'#dc2626':len>160?'#d97706':'#94a3b8';
};

window._setCommsChannel=function(composeId,ch){
  window._commsChannel=ch;
  const wrap=document.getElementById('_subj_'+composeId);
  if(wrap) wrap.style.display=ch==='email'?'block':'none';
};

window._switchHeaderChannel=function(ch){
  window._commsChannel=ch;
  // Update header pill styles without full re-render
  const colors={sms:'#1d4ed8',whatsapp:'#15803d',email:'#c2410c'};
  ['sms','whatsapp','email'].forEach(c=>{
    const btn=document.getElementById('_hch_'+c);
    if(!btn) return;
    const active=c===ch;
    btn.style.background=active?colors[c]:'#f8fafc';
    btn.style.color=active?'#fff':'#94a3b8';
    btn.style.borderColor=active?colors[c]:'#e2e8f0';
  });
  // Show/hide email subject field
  const wrap=document.getElementById('_subj_smsComposeBox');
  if(wrap) wrap.style.display=ch==='email'?'block':'none';
};

function renderCommsCompose(contactId, composeId, sendFn){
  const contact=getContacts().find(c=>c.id===contactId);
  if(!contact) return '';
  const allOut=contact.sms_opted_out&&contact.whatsapp_opted_out;
  const activeCh=window._commsChannel||'sms';
  return `<div style="padding:10px 12px;border-top:1px solid #e2e8f0;background:#fff;flex-shrink:0;">
    <div id="_subj_${composeId}" style="display:${activeCh==='email'?'block':'none'};margin-bottom:6px;">
      <input id="_subj_inp_${composeId}" placeholder="Subject" style="width:100%;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;">
    </div>
    ${allOut?'<div style="color:#dc2626;font-size:12px;text-align:center;padding:6px;">Contact has opted out of all messaging.</div>':
    `<div style="display:flex;gap:8px;align-items:flex-end;">
      <div style="flex:1;display:flex;flex-direction:column;gap:3px;">
        <textarea id="${composeId}" placeholder="Type a message…" rows="4" style="width:100%;padding:11px 13px;border:1px solid #e2e8f0;border-radius:10px;font-size:15px;font-family:inherit;resize:none;box-sizing:border-box;line-height:1.5;" oninput="window._updateCharCount('${composeId}')" onkeydown="if(event.key==='Enter'){if(!event.shiftKey&&!event.altKey){event.preventDefault();${sendFn};}else{event.preventDefault();const t=this;const s=t.selectionStart;t.value=t.value.slice(0,s)+'\n'+t.value.slice(t.selectionEnd);t.selectionStart=t.selectionEnd=s+1;}}"></textarea>
        <div id="_cc_${composeId}" style="font-size:10px;color:#94a3b8;text-align:right;display:none;"></div>
      </div>
      <button id="_sendBtn_${composeId}" onclick="${sendFn}" style="background:#1e3a5f;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">Send</button>
    </div>`}
  </div>`;
}

// Mobile view state: 'list' or 'thread'
let commsMobileView='list';

function renderSms(){
  const el=document.getElementById('smsContent');
  if(!el) return;
  const selContact=getContacts().find(c=>c.id===smsSelectedContactId);
  if(smsSelectedContactId&&!selContact) smsSelectedContactId=null;
  if(!window._commsChannel) window._commsChannel='sms';

  const isMobile=window.innerWidth<640;
  const inGroupsMode=commsView==='groups';
  const inTemplatesMode=commsView==='templates';
  const showList=!isMobile||commsMobileView==='list';
  const showThread=!isMobile||commsMobileView==='thread';

  // Top pill tabs — full width, above the split panel
  const viewPills=`<div style="display:flex;gap:6px;margin-bottom:10px;">
    <button onclick="window._switchCommsView('contacts')" style="padding:8px 22px;border-radius:99px;border:2px solid ${commsView==='contacts'?'#1e3a5f':'#e2e8f0'};font-size:13px;font-weight:700;cursor:pointer;background:${commsView==='contacts'?'#1e3a5f':'#fff'};color:${commsView==='contacts'?'#fff':'#64748b'};transition:all .15s;">Contacts</button>
    <button onclick="window._switchCommsView('groups')" style="padding:8px 22px;border-radius:99px;border:2px solid ${commsView==='groups'?'#0d9488':'#e2e8f0'};font-size:13px;font-weight:700;cursor:pointer;background:${commsView==='groups'?'#0d9488':'#fff'};color:${commsView==='groups'?'#fff':'#64748b'};transition:all .15s;">Groups</button>
    <button onclick="window._switchCommsView('templates')" style="padding:8px 22px;border-radius:99px;border:2px solid ${commsView==='templates'?'#7c3aed':'#e2e8f0'};font-size:13px;font-weight:700;cursor:pointer;background:${commsView==='templates'?'#7c3aed':'#fff'};color:${commsView==='templates'?'#fff':'#64748b'};transition:all .15s;">Templates</button>
  </div>`;

  // Channel filter bar — only shown in the legacy "all channels" view. When the
  // screen is locked to one channel (per-channel pages), the channel is fixed.
  const filterBar=commsLockedChannel?'':`<div style="padding:8px 12px;border-bottom:1px solid #e2e8f0;display:flex;gap:5px;flex-shrink:0;">
    <button onclick="setSmsChannelFilter('all')" style="flex:1;padding:5px;border-radius:6px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;cursor:pointer;background:${smsChannelFilter==='all'?'#1e3a5f':'#f8fafc'};color:${smsChannelFilter==='all'?'#fff':'#64748b'};">All</button>
    <button onclick="setSmsChannelFilter('sms')" style="flex:1;padding:5px;border-radius:6px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;cursor:pointer;background:${smsChannelFilter==='sms'?'#1d4ed8':'#f8fafc'};color:${smsChannelFilter==='sms'?'#fff':'#64748b'};">SMS</button>
    <button onclick="setSmsChannelFilter('whatsapp')" style="flex:1;padding:5px;border-radius:6px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;cursor:pointer;background:${smsChannelFilter==='whatsapp'?'#15803d':'#f8fafc'};color:${smsChannelFilter==='whatsapp'?'#fff':'#64748b'};">WA</button>
    <button onclick="setSmsChannelFilter('email')" style="flex:1;padding:5px;border-radius:6px;border:1px solid #e2e8f0;font-size:11px;font-weight:700;cursor:pointer;background:${smsChannelFilter==='email'?'#c2410c':'#f8fafc'};color:${smsChannelFilter==='email'?'#fff':'#64748b'};">Email</button>
  </div>`;

  const leftW=(inGroupsMode||inTemplatesMode)?(isMobile?'100%':'190px'):(isMobile?'100%':'260px');
  const listPanel=`<div style="display:${showList?'flex':'none'};flex-direction:column;${isMobile?'width:100%;':`width:${leftW};border-right:1px solid #e2e8f0;`}background:#f8fafc;flex-shrink:0;">
    ${inTemplatesMode?renderTemplatesList():inGroupsMode?renderGroupListSidebar():`${filterBar}<div style="padding:10px 12px;border-bottom:1px solid #e2e8f0;flex-shrink:0;"><input id="smsContactSearch" oninput="renderSmsContactList()" placeholder="Search contacts…" style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;"></div><div id="smsContactList" style="flex:1;overflow-y:auto;"></div>`}
  </div>`;

  const threadHeader=selContact?`
    ${isMobile?`<button type="button" ontouchend="event.preventDefault();window._commsBackToList();" onclick="window._commsBackToList();" style="background:none;border:none;font-size:24px;cursor:pointer;padding:8px 12px 8px 4px;color:#1e3a5f;-webkit-tap-highlight-color:rgba(0,0,0,.1);min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;">&#8592;</button>`:''}
    <div style="width:40px;height:40px;border-radius:50%;background:#1e3a5f;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0;">${(selContact.first_name||'?')[0].toUpperCase()}</div>
    <div style="flex:1;min-width:0;">
      <div style="font-weight:700;font-size:15px;color:#1e3a5f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${selContact.first_name||''} ${selContact.last_name||''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:3px;">
        ${selContact.phone
          ?`<span style="font-size:12px;color:#374151;">&#128244; ${selContact.phone}</span>`
          :`<span style="font-size:12px;color:#dc2626;font-weight:600;">&#9888; No phone on file</span>`}
        ${selContact.email
          ?`<span style="font-size:12px;color:#374151;">&#9993; ${selContact.email}</span>`
          :`<span style="font-size:12px;color:#94a3b8;">No email on file</span>`}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;align-items:flex-end;">
      ${selContact.sms_opted_out?'<span style="font-size:10px;background:#fee2e2;color:#dc2626;padding:2px 7px;border-radius:99px;font-weight:700;white-space:nowrap;">SMS OUT</span>':''}
      ${selContact.whatsapp_opted_out?'<span style="font-size:10px;background:#fee2e2;color:#dc2626;padding:2px 7px;border-radius:99px;font-weight:700;white-space:nowrap;">WA OUT</span>':''}
    </div>
  `:'<div style="color:#94a3b8;font-size:13px;">Select a contact</div>';

  const threadPanel=inTemplatesMode
    ?`<div style="display:${showThread?'flex':'none'};flex-direction:column;flex:1;min-width:0;min-height:0;">${renderTemplateDetail()}</div>`
    :inGroupsMode
    ?`<div style="display:${showThread?'flex':'none'};flex-direction:column;flex:1;min-width:0;min-height:0;">${renderGroupDetailPanel(isMobile)}</div>`
    :`<div style="display:${showThread?'flex':'none'};flex-direction:column;flex:1;min-width:0;min-height:0;">
    <div style="padding:10px 14px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:8px;min-height:54px;flex-shrink:0;position:sticky;top:0;background:#fff;z-index:2;">
      ${threadHeader}
    </div>
    <div id="smsThread" style="flex:1;overflow-y:auto;padding:14px;background:#f8fafc;">
      ${smsSelectedContactId?renderCommsThread(smsSelectedContactId,smsChannelFilter):''}
    </div>
    ${smsSelectedContactId?renderCommsCompose(smsSelectedContactId,'smsComposeBox','sendCommsMessage()'):''}
  </div>`;

  el.innerHTML=`${viewPills}<div style="display:flex;height:calc(100vh - 158px);border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;">${listPanel}${threadPanel}</div>`;

  renderSmsContactList();
  const t=document.getElementById('smsThread');
  if(t) t.scrollTop=t.scrollHeight;
}

window.renderSmsContactList=function(){
  const search=(document.getElementById('smsContactSearch')?.value||'').toLowerCase();
  const listEl=document.getElementById('smsContactList');
  if(!listEl) return;
  const allC=[...getContacts()].filter(c=>c.first_name||c.last_name).sort((a,b)=>(a.first_name+' '+a.last_name).localeCompare(b.first_name+' '+b.last_name));
  const commsIds=[...new Set(smsMessages.map(m=>m.contact_id).filter(Boolean))];
  const withHist=allC.filter(c=>commsIds.includes(c.id)&&(!search||(c.first_name+' '+c.last_name).toLowerCase().includes(search)));
  const withoutHist=allC.filter(c=>!commsIds.includes(c.id)&&search&&(c.first_name+' '+c.last_name).toLowerCase().includes(search));
  const shown=[...withHist,...withoutHist];
  if(!shown.length){listEl.innerHTML='<div style="padding:16px;font-size:13px;color:#94a3b8;text-align:center;">No contacts found</div>';return;}
  listEl.innerHTML=shown.map(c=>{
    const name=(c.first_name||'')+' '+(c.last_name||'');
    const lastMsg=smsMessages.filter(m=>m.contact_id===c.id&&(smsChannelFilter==='all'||m.channel===smsChannelFilter)).slice(-1)[0];
    const preview=lastMsg?(lastMsg.body.slice(0,36)+(lastMsg.body.length>36?'…':'')):'Tap to start a conversation';
    const sel=c.id===smsSelectedContactId;
    const hasOut=(c.sms_opted_out||c.whatsapp_opted_out)?'<span style="font-size:9px;color:#dc2626;font-weight:700;margin-left:3px;">OUT</span>':'';
    const lastCh=lastMsg?chPill(lastMsg.channel||'sms'):'';
    return `<div onclick="selectSmsContact('${c.id}')" style="padding:11px 13px;border-bottom:1px solid #f1f5f9;cursor:pointer;background:${sel?'#e8f4ff':'transparent'};" onmouseover="this.style.background='${sel?'#e8f4ff':'#f1f5f9'}'" onmouseout="this.style.background='${sel?'#e8f4ff':'transparent'}'">
      <div style="font-weight:600;font-size:13px;color:#1e293b;">${name.trim()}${hasOut}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px;display:flex;align-items:center;gap:4px;">${lastCh}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">${preview}</span></div>
    </div>`;
  }).join('');
};

window._commsBackToList=function(){commsMobileView='list';renderSms();};
window._switchCommsView=function(v){
  commsView=v;
  if(v==='groups'){smsSelectedContactId=null;commsMobileView='list';}
  else if(v==='templates'){smsSelectedContactId=null;commsActiveListId=null;}
  else{commsActiveListId=null;groupSendChannel=commsLockedChannel||'sms';}
  if(commsLockedChannel) groupSendChannel=commsLockedChannel;
  renderSms();
};

window.selectSmsContact=function(id){
  smsSelectedContactId=id;
  commsMobileView='thread';
  // On a locked per-channel page the compose channel stays fixed; otherwise
  // default to the channel of the last message with this contact.
  if(commsLockedChannel){
    window._commsChannel=commsLockedChannel;
  } else {
    const msgs=(smsMessages||[]).filter(m=>m.contact_id===id);
    const lastCh=msgs.length?msgs[msgs.length-1].channel:null;
    window._commsChannel=(lastCh&&['sms','whatsapp','email'].includes(lastCh))?lastCh:'sms';
  }
  renderSms();
};

window.sendCommsMessage=async function(){
  const compose=document.getElementById('smsComposeBox');
  const body=compose?.value.trim();
  if(!body){toast('Type a message first','error');return;}
  const contact=getContacts().find(c=>c.id===smsSelectedContactId);
  if(!contact){toast('No contact selected','error');return;}
  const ch=window._commsChannel||'sms';
  // Lock UI immediately to prevent double-sends
  const sendBtn=document.getElementById('_sendBtn_smsComposeBox');
  if(sendBtn){sendBtn.disabled=true;sendBtn.textContent='Sending…';}
  if(compose) compose.value='';
  const unlock=()=>{if(sendBtn){sendBtn.disabled=false;sendBtn.textContent='Send';}};
  if(ch==='email'){
    if(!contact.email){unlock();if(compose)compose.value=body;toast('This contact has no email address on file','error');return;}
    const subjEl=document.getElementById('_subj_inp_smsComposeBox');
    const subject=(subjEl?.value||'').trim()||'Message from Coach4U';
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session) throw new Error('Not authenticated');
      const res=await fetch(`${SUPABASE_EDGE_URL}/send-email`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
        body:JSON.stringify({to_email:contact.email,subject,body,contact_id:contact.id})
      });
      const json=await res.json();
      if(!res.ok) throw new Error(json.error||'Send failed');
      if(subjEl) subjEl.value='';
      await loadSmsMessages();
      renderSms();
      toast('Email sent','success');
    }catch(e){ if(compose)compose.value=body;unlock();toast('Send failed: '+e.message,'error'); }
    return;
  }
  if(!contact.phone){if(compose)compose.value=body;unlock();toast('This contact has no phone number on file','error');return;}
  if(ch==='sms'&&contact.sms_opted_out){if(compose)compose.value=body;unlock();toast('Contact has opted out of SMS','error');return;}
  if(ch==='whatsapp'&&contact.whatsapp_opted_out){if(compose)compose.value=body;unlock();toast('Contact has opted out of WhatsApp','error');return;}
  const endpoint=ch==='whatsapp'?'send-whatsapp':'send-sms';
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) throw new Error('Not authenticated');
    const res=await fetch(`${SUPABASE_EDGE_URL}/${endpoint}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
      body:JSON.stringify({to:contact.phone,body,contact_id:contact.id})
    });
    const json=await res.json();
    if(!res.ok) throw new Error(json.error||'Send failed');
    await loadSmsMessages();
    renderSms();
    toast('Message sent','success');
  }catch(e){ if(compose)compose.value=body;unlock();toast('Send failed: '+e.message,'error'); }
};

window.openCommsForContact=function(contactId,channel){
  smsSelectedContactId=contactId;
  smsChannelFilter=channel||'all';
  commsMobileView='thread';
  navTo('sms');
};
window.openSmsForContact=window.openCommsForContact;

window.renderMiniComms=function(contactId, containerId){
  const el=document.getElementById(containerId);
  if(!el) return;
  const contact=getContacts().find(c=>c.id===contactId);
  if(!contact){el.innerHTML='<div style="color:#94a3b8;font-size:12px;">Contact not found</div>';return;}
  const miniCh=window['_miniCh_'+contactId]||'sms';
  window._commsChannel=miniCh;
  const thread=renderCommsThread(contactId,'all');
  const compose=renderCommsCompose(contactId,'miniCompose_'+contactId,`sendMiniComms('${contactId}')`);
  el.innerHTML=`
    <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <div style="max-height:260px;overflow-y:auto;padding:12px;background:#f8fafc;">${thread}</div>
      ${compose}
    </div>
    <div style="margin-top:8px;text-align:right;">
      <button onclick="openCommsForContact('${contactId}')" style="font-size:11px;color:#1e3a5f;background:none;border:none;cursor:pointer;text-decoration:underline;">Open full thread &#8599;</button>
    </div>`;
  const t=el.querySelector('[style*="overflow-y:auto"]');
  if(t) t.scrollTop=t.scrollHeight;
};

window.sendMiniComms=async function(contactId){
  const compose=document.getElementById('miniCompose_'+contactId);
  const body=compose?.value.trim();
  if(!body){toast('Type a message first','error');return;}
  const contact=getContacts().find(c=>c.id===contactId);
  if(!contact){toast('Contact not found','error');return;}
  const ch=window._commsChannel||'sms';
  if(ch==='email'){
    if(!contact.email){toast('No email address on file','error');return;}
    const subjEl=document.getElementById('_subj_inp_miniCompose_'+contactId);
    const subject=(subjEl?.value||'').trim()||'Message from Coach4U';
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session) throw new Error('Not authenticated');
      const res=await fetch(`${SUPABASE_EDGE_URL}/send-email`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
        body:JSON.stringify({to_email:contact.email,subject,body,contact_id:contactId})
      });
      const json=await res.json();
      if(!res.ok) throw new Error(json.error||'Send failed');
      if(compose) compose.value='';
      if(subjEl) subjEl.value='';
      await loadSmsMessages();
      window['_miniCh_'+contactId]=ch;
      window.renderMiniComms(contactId,'miniComms_'+contactId);
      toast('Email sent','success');
    }catch(e){ toast('Send failed: '+e.message,'error'); }
    return;
  }
  if(!contact.phone){toast('No phone number on file','error');return;}
  const endpoint=ch==='whatsapp'?'send-whatsapp':'send-sms';
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) throw new Error('Not authenticated');
    const res=await fetch(`${SUPABASE_EDGE_URL}/${endpoint}`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
      body:JSON.stringify({to:contact.phone,body,contact_id:contactId})
    });
    const json=await res.json();
    if(!res.ok) throw new Error(json.error||'Send failed');
    if(compose) compose.value='';
    await loadSmsMessages();
    window['_miniCh_'+contactId]=ch;
    window.renderMiniComms(contactId,'miniComms_'+contactId);
    toast('Sent','success');
  }catch(e){ toast('Send failed: '+e.message,'error'); }
};
async function loadCommsLists(){
  const [{data:lists,error:e1},{data:members}]=await Promise.all([
    supabase.from('comms_lists').select('*').order('name'),
    supabase.from('comms_list_members').select('*')
  ]);
  if(lists) commsLists=lists;
  if(members) commsListMembers=members;
  if(e1&&e1.code!=='42P01') console.error('loadCommsLists:',e1);
}

function getThqGroupContacts(){
  const thqClients=getClients().filter(c=>c.role==='Community'&&c.status==='Active');
  const cids=[...new Set(thqClients.flatMap(c=>c.members||[]))];
  return getContacts().filter(c=>cids.includes(c.id));
}

function renderGroupListSidebar(){
  const thq=getThqGroupContacts();
  const customLists=commsLists.filter(l=>l.filter_type==='manual');
  let h='<div style="display:flex;flex-direction:column;flex:1;overflow-y:auto;">';
  const isThqActive=commsActiveListId==='thrivehq';
  h+=`<div onclick="window.selectCommsGroup('thrivehq')" style="padding:11px 13px;border-bottom:1px solid #f1f5f9;cursor:pointer;background:${isThqActive?'#e8f4ff':'transparent'};">
    <div style="font-weight:700;font-size:13px;color:#0d9488;">&#127775; ThriveHQ Members</div>
    <div style="font-size:11px;color:#64748b;margin-top:2px;">${thq.length} active member${thq.length!==1?'s':''} &middot; Auto-populated</div>
  </div>`;
  customLists.forEach(list=>{
    const mids=commsListMembers.filter(m=>m.list_id===list.id).map(m=>m.contact_id);
    const isActive=commsActiveListId===list.id;
    h+=`<div onclick="window.selectCommsGroup('${list.id}')" style="padding:11px 13px;border-bottom:1px solid #f1f5f9;cursor:pointer;background:${isActive?'#e8f4ff':'transparent'};">
      <div style="font-weight:600;font-size:13px;color:#1e293b;">&#128101; ${list.name.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;">${mids.length} member${mids.length!==1?'s':''} &middot; Custom</div>
    </div>`;
  });
  const isNewActive=commsActiveListId==='new';
  h+=`<div style="padding:10px 12px;">
    <button onclick="window.selectCommsGroup('new')" style="width:100%;padding:8px;border:2px dashed ${isNewActive?'#1e3a5f':'#cbd5e1'};border-radius:8px;background:${isNewActive?'#f0f4ff':'transparent'};color:${isNewActive?'#1e3a5f':'#64748b'};font-size:12px;font-weight:600;cursor:pointer;">+ New List</button>
  </div></div>`;
  return h;
}

function renderGroupDetailPanel(isMob){
  const backBtn=isMob?`<button type="button" ontouchend="event.preventDefault();window._commsBackToList();" onclick="window._commsBackToList();" style="background:none;border:none;font-size:24px;cursor:pointer;padding:8px 12px 8px 4px;color:#1e3a5f;-webkit-tap-highlight-color:rgba(0,0,0,.1);min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;">&#8592;</button>`:'';

  if(commsActiveListId==='new'){
    const allC=[...getContacts()].filter(c=>c.first_name||c.last_name).sort((a,b)=>(a.first_name||'').localeCompare(b.first_name||''));
    const rows=allC.map(c=>{
      const name=`${c.first_name||''} ${c.last_name||''}`.trim();
      const dis=c.sms_opted_out||!c.phone;
      return `<label style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #f1f5f9;cursor:${dis?'default':'pointer'};opacity:${dis?'.5':'1'};">
        <input type="checkbox" name="newGroupContact" value="${c.id}" ${dis?'disabled':''} style="width:16px;height:16px;">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:#1e293b;">${name.replace(/&/g,'&amp;').replace(/</g,'&lt;')}${c.sms_opted_out?'<span style="font-size:9px;background:#fee2e2;color:#dc2626;padding:1px 5px;border-radius:99px;margin-left:5px;">OPTED OUT</span>':''}</div>
          <div style="font-size:11px;color:#94a3b8;">${c.phone||'No phone'}</div>
        </div>
      </label>`;
    }).join('');
    return `<div style="padding:12px 14px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:8px;flex-shrink:0;position:sticky;top:0;background:#fff;z-index:2;">${backBtn}<div style="font-weight:700;font-size:15px;color:#1e3a5f;flex:1;">New List</div></div>
    <div style="padding:10px 14px;border-bottom:1px solid #e2e8f0;flex-shrink:0;"><input id="newGroupName" placeholder="List name…" style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;"></div>
    <div style="flex:1;overflow-y:auto;">${rows}</div>
    <div style="padding:10px 12px;border-top:1px solid #e2e8f0;background:#fff;flex-shrink:0;"><button onclick="window.saveCommsGroup()" style="width:100%;padding:10px;background:#1e3a5f;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">Save List</button></div>`;
  }

  if(!commsActiveListId){
    return `<div style="display:flex;align-items:center;justify-content:center;flex:1;color:#94a3b8;font-size:13px;padding:32px;">Select a list to send messages</div>`;
  }

  const isThq=commsActiveListId==='thrivehq';
  let listName,members,canDelete;
  if(isThq){
    listName='ThriveHQ Members';members=getThqGroupContacts();canDelete=false;
  } else {
    const list=commsLists.find(l=>l.id===commsActiveListId);
    if(!list) return `<div style="padding:16px;color:#94a3b8;">List not found.</div>`;
    listName=list.name;
    const mids=commsListMembers.filter(m=>m.list_id===list.id).map(m=>m.contact_id);
    members=getContacts().filter(c=>mids.includes(c.id));
    canDelete=true;
  }
  // Channel selector determines eligible members and send method
  const chSel=groupSendChannel||'sms';
  let eligible,eligibleLabel,noEligibleMsg,sendBtnColor;
  if(chSel==='sms'){
    eligible=members.filter(c=>!c.sms_opted_out&&c.phone);
    eligibleLabel=`${eligible.length} can receive SMS`;
    noEligibleMsg='No eligible SMS recipients — all opted out or missing phone number.';
    sendBtnColor='#1d4ed8';
  } else if(chSel==='whatsapp'){
    eligible=members.filter(c=>!c.whatsapp_opted_out&&c.phone);
    eligibleLabel=`${eligible.length} can receive WhatsApp`;
    noEligibleMsg='No eligible WhatsApp recipients — all opted out or missing phone number.';
    sendBtnColor='#15803d';
  } else {
    eligible=members.filter(c=>c.email);
    eligibleLabel=`${eligible.length} have email`;
    noEligibleMsg='No email addresses on file for this group.';
    sendBtnColor='#c2410c';
  }
  const optedOut=members.filter(c=>c.sms_opted_out).length;
  const noPhone=members.filter(c=>!c.phone&&!c.sms_opted_out).length;

  const channelPills=`<div style="display:flex;gap:5px;padding:8px 14px;border-bottom:1px solid #e2e8f0;flex-shrink:0;background:#fff;">
    <span style="font-size:11px;color:#64748b;align-self:center;margin-right:2px;font-weight:600;">Send via:</span>
    <button onclick="window._setGroupChannel('sms')" style="padding:5px 12px;border-radius:99px;border:2px solid ${chSel==='sms'?'#1d4ed8':'#e2e8f0'};font-size:11px;font-weight:700;cursor:pointer;background:${chSel==='sms'?'#1d4ed8':'#f8fafc'};color:${chSel==='sms'?'#fff':'#64748b'};">SMS</button>
    <button onclick="window._setGroupChannel('whatsapp')" style="padding:5px 12px;border-radius:99px;border:2px solid ${chSel==='whatsapp'?'#15803d':'#e2e8f0'};font-size:11px;font-weight:700;cursor:pointer;background:${chSel==='whatsapp'?'#15803d':'#f8fafc'};color:${chSel==='whatsapp'?'#fff':'#64748b'};">WhatsApp</button>
    <button onclick="window._setGroupChannel('email')" style="padding:5px 12px;border-radius:99px;border:2px solid ${chSel==='email'?'#c2410c':'#e2e8f0'};font-size:11px;font-weight:700;cursor:pointer;background:${chSel==='email'?'#c2410c':'#f8fafc'};color:${chSel==='email'?'#fff':'#64748b'};">Email</button>
  </div>`;

  const memberRows=members.map(c=>{
    const name=`${c.first_name||''} ${c.last_name||''}`.trim();
    let statusBadge;
    if(chSel==='email'){
      statusBadge=c.email
        ?'<span style="font-size:9px;background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:99px;font-weight:700;">&#10003; email</span>'
        :'<span style="font-size:9px;background:#fef3c7;color:#d97706;padding:1px 6px;border-radius:99px;font-weight:700;">NO EMAIL</span>';
    } else if(chSel==='whatsapp'){
      const out=c.whatsapp_opted_out,np=!c.phone;
      statusBadge=out?'<span style="font-size:9px;background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:99px;font-weight:700;">WA OUT</span>':np?'<span style="font-size:9px;background:#fef3c7;color:#d97706;padding:1px 6px;border-radius:99px;font-weight:700;">NO PHONE</span>':'<span style="font-size:9px;background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:99px;font-weight:700;">&#10003; WA</span>';
    } else {
      const out=c.sms_opted_out,np=!c.phone;
      statusBadge=out?'<span style="font-size:9px;background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:99px;font-weight:700;">OPTED OUT</span>':np?'<span style="font-size:9px;background:#fef3c7;color:#d97706;padding:1px 6px;border-radius:99px;font-weight:700;">NO PHONE</span>':'<span style="font-size:9px;background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:99px;font-weight:700;">&#10003;</span>';
    }
    const ineligible=(chSel==='email'&&!c.email)||(chSel==='sms'&&(c.sms_opted_out||!c.phone))||(chSel==='whatsapp'&&(c.whatsapp_opted_out||!c.phone));
    const contactDetail=chSel==='email'?(c.email||'No email'):(c.phone||'No phone');
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid #f1f5f9;opacity:${ineligible?'.55':'1'};">
      <div style="width:30px;height:30px;border-radius:50%;background:${isThq?'#0d9488':'#1e3a5f'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${(c.first_name||'?')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;color:#1e293b;">${name.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div><div style="font-size:11px;color:#94a3b8;">${contactDetail}</div></div>
      ${statusBadge}
    </div>`;
  }).join('');

  const _tplKey=isThq?'thrivehq':commsActiveListId;
  const _templates=getGroupTemplates(_tplKey);
  const _templateCards=_templates.map(t=>`<div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;background:#fff;margin-bottom:7px;display:flex;align-items:flex-start;gap:8px;cursor:pointer;" onclick="window.loadGroupTemplate('${_tplKey}','${t.id}')" onmouseover="this.style.borderColor='#0d9488'" onmouseout="this.style.borderColor='#e2e8f0'">
    <div style="flex:1;min-width:0;">
      <div style="font-size:12px;font-weight:700;color:#0d9488;margin-bottom:3px;">${t.name.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>
      <div style="font-size:11px;color:#475569;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${t.body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,' ')}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
      <span style="font-size:10px;background:#ccfbf1;color:#0d9488;padding:2px 8px;border-radius:99px;font-weight:700;white-space:nowrap;text-align:center;">Load</span>
      <button onclick="event.stopPropagation();window.deleteGroupTemplate('${_tplKey}','${t.id}')" style="font-size:10px;padding:3px 8px;background:none;border:1px solid #fecaca;color:#dc2626;border-radius:99px;cursor:pointer;white-space:nowrap;">&#x2715;</button>
    </div>
  </div>`).join('');

  const emailSubjectField=chSel==='email'?`<input id="groupEmailSubject" placeholder="Subject…" style="width:100%;padding:8px 11px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;margin-bottom:6px;">`:'' ;

  return `<div style="padding:12px 14px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:8px;flex-shrink:0;position:sticky;top:0;background:#fff;z-index:2;">
    ${backBtn}
    <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:15px;color:#1e3a5f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${listName.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>
    <div style="font-size:11px;color:#64748b;">${members.length} member${members.length!==1?'s':''} &middot; ${eligibleLabel}</div></div>
    ${canDelete?`<button onclick="window.deleteCommsGroup('${commsActiveListId}')" style="font-size:11px;color:#dc2626;background:none;border:none;cursor:pointer;padding:4px 8px;border-radius:6px;flex-shrink:0;">Delete</button>`:''}
  </div>
  ${channelPills}
  <div style="flex:1;overflow-y:auto;">${memberRows||'<div style="padding:24px;color:#94a3b8;text-align:center;font-size:13px;">No members in this list</div>'}</div>
  <div style="border-top:1px solid #e2e8f0;background:#f8fafc;flex-shrink:0;">
    <div style="padding:8px 12px 4px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:12px;font-weight:700;color:#475569;">&#128196; Templates${_templates.length?' ('+_templates.length+')':''}</span>
      <button onclick="window.toggleTplSaveForm('${_tplKey}')" style="font-size:11px;padding:4px 10px;background:none;border:1px solid #e2e8f0;color:#64748b;border-radius:6px;cursor:pointer;">+ Save as template</button>
    </div>
    <div id="tplSaveForm_${_tplKey}" style="display:none;padding:0 12px 8px;">
      <input id="tplNameInput_${_tplKey}" placeholder="Template name (e.g. Tuesday check-in)…" style="width:100%;padding:7px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;box-sizing:border-box;margin-bottom:6px;">
      <div style="display:flex;gap:6px;justify-content:flex-end;">
        <button onclick="window.toggleTplSaveForm('${_tplKey}')" style="font-size:11px;padding:5px 10px;background:none;border:1px solid #e2e8f0;color:#64748b;border-radius:6px;cursor:pointer;">Cancel</button>
        <button onclick="window.saveGroupTemplateNamed('${_tplKey}')" style="font-size:11px;padding:5px 12px;background:#0d9488;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;">Save</button>
      </div>
    </div>
    <div style="max-height:180px;overflow-y:auto;padding:0 12px 8px;">
      ${_templates.length?_templateCards:'<div style="font-size:11px;color:#94a3b8;padding:2px 0 6px;">No templates yet — type a message below and save it.</div>'}
    </div>
  </div>
  <div id="groupSendProgress" style="display:none;padding:8px 14px;background:#f0fdf4;border-top:1px solid #bbf7d0;font-size:12px;color:#15803d;text-align:center;"></div>
  <div style="padding:10px 12px;border-top:1px solid #e2e8f0;background:#fff;flex-shrink:0;">
    ${eligible.length>0
      ?`<div style="display:flex;flex-direction:column;gap:6px;">
          ${emailSubjectField}
          <div style="display:flex;gap:8px;align-items:flex-end;">
            <div style="flex:1;display:flex;flex-direction:column;gap:3px;">
              <textarea id="groupComposeBox" placeholder="Message to ${eligible.length} ${chSel==='email'?'recipient':'member'}${eligible.length!==1?'s':''}…" rows="2" style="width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;font-family:inherit;resize:none;box-sizing:border-box;" oninput="window._updateCharCount('groupComposeBox')"></textarea>
              <div id="_cc_groupComposeBox" style="font-size:10px;color:#94a3b8;text-align:right;display:none;"></div>
            </div>
            <button onclick="window.sendGroupMessage('${commsActiveListId}')" style="background:${sendBtnColor};color:#fff;border:none;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">Send to ${eligible.length}</button>
          </div>
        </div>`
      :`<div style="color:#dc2626;font-size:12px;text-align:center;padding:6px;">${noEligibleMsg}</div>`
    }
  </div>`;
}

window.selectCommsGroup=function(id){commsActiveListId=id;commsMobileView='thread';renderSms();};
window._setGroupChannel=function(ch){groupSendChannel=ch;renderSms();};

window.sendGroupSms=function(listId){groupSendChannel='sms';window.sendGroupMessage(listId);};

window.sendGroupMessage=async function(listId){
  const compose=document.getElementById('groupComposeBox');
  const body=compose?.value.trim();
  if(!body){toast('Type a message first','error');return;}
  const ch=groupSendChannel||'sms';
  const isThq=listId==='thrivehq';
  const members=isThq?getThqGroupContacts():getContacts().filter(c=>commsListMembers.filter(m=>m.list_id===listId).map(m=>m.contact_id).includes(c.id));
  let eligible;
  if(ch==='sms') eligible=members.filter(c=>!c.sms_opted_out&&c.phone);
  else if(ch==='whatsapp') eligible=members.filter(c=>!c.whatsapp_opted_out&&c.phone);
  else eligible=members.filter(c=>c.email);
  if(!eligible.length){toast('No eligible recipients','error');return;}
  const progressEl=document.getElementById('groupSendProgress');
  if(progressEl){progressEl.style.display='block';progressEl.textContent=`Sending 0 / ${eligible.length}…`;}
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){toast('Not authenticated','error');return;}
  let sent=0,failed=0;
  let endpoint,buildPayload;
  if(ch==='sms'){
    endpoint=`${SUPABASE_EDGE_URL}/send-sms`;
    buildPayload=contact=>({to:contact.phone,body,contact_id:contact.id});
  } else if(ch==='whatsapp'){
    endpoint=`${SUPABASE_EDGE_URL}/send-whatsapp`;
    buildPayload=contact=>({to:contact.phone,body,contact_id:contact.id});
  } else {
    const subjectEl=document.getElementById('groupEmailSubject');
    const subject=(subjectEl?.value.trim())||'Message from Coach4U';
    endpoint=`${SUPABASE_EDGE_URL}/send-email`;
    buildPayload=contact=>({to:contact.email,subject,body,contact_id:contact.id});
  }
  for(const contact of eligible){
    try{
      const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify(buildPayload(contact))});
      if(res.ok) sent++; else failed++;
    }catch(e){failed++;}
    if(progressEl) progressEl.textContent=`Sending ${sent+failed} / ${eligible.length}… (${sent} sent${failed?' &middot; '+failed+' failed':''})`;
  }
  if(compose) compose.value='';
  await loadSmsMessages();
  if(progressEl){
    progressEl.textContent=`Done: ${sent} sent${failed?' &middot; '+failed+' failed':''}`;
    progressEl.style.background=failed?'#fef2f2':'#f0fdf4';
    progressEl.style.color=failed?'#dc2626':'#15803d';
    progressEl.style.borderTop=`1px solid ${failed?'#fecaca':'#bbf7d0'}`;
    setTimeout(()=>{if(progressEl) progressEl.style.display='none';},5000);
  }
  toast(failed?`${sent} sent, ${failed} failed`:`${sent} messages sent`,'success');
};

window.saveCommsGroup=async function(){
  const nameEl=document.getElementById('newGroupName');
  const name=(nameEl?.value||'').trim();
  if(!name){toast('Enter a list name','error');return;}
  const checked=[...document.querySelectorAll('input[name="newGroupContact"]:checked')].map(el=>el.value);
  if(!checked.length){toast('Select at least one contact','error');return;}
  const {data:list,error:e1}=await supabase.from('comms_lists').insert({name,filter_type:'manual'}).select().single();
  if(e1){toast('Error saving list: '+e1.message,'error');return;}
  const {error:e2}=await supabase.from('comms_list_members').insert(checked.map(contact_id=>({list_id:list.id,contact_id})));
  if(e2){toast('Error saving members: '+e2.message,'error');return;}
  await loadCommsLists();
  commsActiveListId=list.id;
  commsMobileView='thread';
  renderSms();
  toast('List saved','success');
};

window.deleteCommsGroup=async function(listId){
  if(!confirm('Delete this list?')) return;
  const {error}=await supabase.from('comms_lists').delete().eq('id',listId);
  if(error){toast('Error: '+error.message,'error');return;}
  await loadCommsLists();
  commsActiveListId=null;
  commsMobileView='list';
  renderSms();
  toast('List deleted','success');
};

// TEMPLATES SECTION
let commsTemplateSelected=null;
let commsTplFormVisible=false;
let commsTplEditId=null;

function getTplOrder(prog){try{const o=localStorage.getItem('comms_tpl_order_'+prog);return o?JSON.parse(o):null;}catch(e){return null;}}
function saveTplOrder(prog,ids){try{localStorage.setItem('comms_tpl_order_'+prog,JSON.stringify(ids));}catch(e){}}
function getSortedTemplates(prog){
  const temps=getGroupTemplates(prog);
  const order=getTplOrder(prog);
  if(!order||!order.length) return temps;
  const map=Object.fromEntries(temps.map(t=>[t.id,t]));
  const sorted=order.filter(id=>map[id]).map(id=>map[id]);
  const rest=temps.filter(t=>!order.includes(t.id));
  return [...sorted,...rest];
}

function renderTemplatesList(){
  const programs=['thrivehq','couples','individual','gallup','general'];
  const programLabels={thrivehq:'ThriveHQ',couples:'Couples',individual:'Individuals',gallup:'Gallup Strengths',general:'General'};
  const items=programs.map(prog=>{
    const temps=getGroupTemplates(prog);
    const count=temps.length;
    const sel=commsTemplateSelected===prog;
    return `<div onclick="window.selectCommTemplate('${prog}')" style="padding:12px 14px;border-bottom:1px solid #f1f5f9;cursor:pointer;background:${sel?'#ede9fe':'transparent'};" onmouseover="this.style.background='${sel?'#ede9fe':'#f1f5f9'}'" onmouseout="this.style.background='${sel?'#ede9fe':'transparent'}'">
      <div style="font-weight:600;font-size:13px;color:#1e293b;">${programLabels[prog]}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${count} template${count!==1?'s':''}</div>
    </div>`;
  }).join('');
  return `<div style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#475569;flex-shrink:0;">Programs</div><div style="flex:1;overflow-y:auto;">${items}</div>`;
}

function renderTemplateDetail(){
  if(!commsTemplateSelected) return `<div style="display:flex;align-items:center;justify-content:center;flex:1;color:#94a3b8;font-size:13px;padding:32px;">Select a program to view templates</div>`;
  const prog=commsTemplateSelected;
  const isMobile=window.innerWidth<640;
  const label={thrivehq:'ThriveHQ',couples:'Couples',individual:'Individuals',gallup:'Gallup Strengths',general:'General'}[prog];
  const temps=getSortedTemplates(prog);
  const editT=commsTplEditId?temps.find(t=>t.id===commsTplEditId):null;
  const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const escAttr=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

  const formHtml=commsTplFormVisible?`<div style="border:2px solid #7c3aed;border-radius:10px;padding:14px;background:#faf5ff;margin-bottom:12px;">
    <div style="font-weight:700;font-size:13px;color:#7c3aed;margin-bottom:10px;">${editT?'Edit Template':'New Template'}</div>
    <div style="margin-bottom:8px;"><label style="font-size:11px;font-weight:700;color:#475569;display:block;margin-bottom:4px;">Name</label>
      <input id="tplFormName" value="${editT?escAttr(editT.name):''}" placeholder="Template name" style="width:100%;padding:8px;border:1px solid #d8b4fe;border-radius:6px;font-size:13px;box-sizing:border-box;"></div>
    <div style="margin-bottom:10px;"><label style="font-size:11px;font-weight:700;color:#475569;display:block;margin-bottom:4px;">Message</label>
      <textarea id="tplFormBody" rows="6" placeholder="Message text..." style="width:100%;padding:8px;border:1px solid #d8b4fe;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:inherit;resize:vertical;">${editT?esc(editT.body):''}</textarea></div>
    <div style="display:flex;gap:8px;">
      <button onclick="window.saveTplForm('${prog}')" style="flex:1;padding:8px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">${editT?'Save Changes':'Add Template'}</button>
      <button onclick="window.closeTplForm()" style="padding:8px 16px;background:#f1f5f9;color:#475569;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>
    </div>
  </div>`:'';

  const templateCards=temps.map((t,i)=>{
    const isFirst=i===0, isLast=i===temps.length-1;
    const arrowStyle=(dis)=>`font-size:12px;padding:3px 8px;background:${dis?'#f1f5f9':'#f8fafc'};color:${dis?'#cbd5e1':'#475569'};border:1px solid #e2e8f0;border-radius:5px;cursor:${dis?'default':'pointer'};font-weight:700;line-height:1;`;
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#fff;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;gap:6px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;flex:1;min-width:0;">${esc(t.name)}</div>
        <div style="display:flex;gap:4px;flex-shrink:0;align-items:center;">
          <button onclick="event.stopPropagation();window.moveTplUp('${prog}','${t.id}')" ${isFirst?'disabled':''} title="Move up" style="${arrowStyle(isFirst)}">&#8593;</button>
          <button onclick="event.stopPropagation();window.moveTplDown('${prog}','${t.id}')" ${isLast?'disabled':''} title="Move down" style="${arrowStyle(isLast)}">&#8595;</button>
          <button onclick="event.stopPropagation();window.openTplForm('${prog}','${t.id}')" title="Edit" style="font-size:11px;padding:3px 8px;background:#f8fafc;color:#475569;border:1px solid #e2e8f0;border-radius:5px;cursor:pointer;font-weight:600;">Edit</button>
          <button onclick="event.stopPropagation();window.copyTemplateText('${prog}','${t.id}')" style="font-size:11px;padding:3px 8px;background:#e8f4ff;color:#2563eb;border:none;border-radius:5px;cursor:pointer;font-weight:600;">Copy</button>
        </div>
      </div>
      <div style="font-size:12px;color:#475569;line-height:1.6;white-space:pre-wrap;margin-bottom:10px;background:#f8fafc;padding:10px;border-radius:6px;max-height:120px;overflow-y:auto;">${esc(t.body)}</div>
      <button onclick="event.stopPropagation();window.deleteGroupTemplate('${prog}','${t.id}')" style="font-size:10px;padding:4px 8px;background:none;border:1px solid #fecaca;color:#dc2626;border-radius:6px;cursor:pointer;width:100%;font-weight:600;">Delete</button>
    </div>`;
  }).join('');

  return `<div style="padding:12px 14px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:8px;flex-shrink:0;position:sticky;top:0;background:#fff;z-index:2;">
    ${isMobile?`<button type="button" ontouchend="event.preventDefault();window._commsBackToList();" onclick="window._commsBackToList();" style="background:none;border:none;font-size:24px;cursor:pointer;padding:8px 12px 8px 4px;color:#1e3a5f;-webkit-tap-highlight-color:rgba(0,0,0,.1);min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;">&#8592;</button>`:''}
    <div style="flex:1;"><div style="font-weight:700;font-size:15px;color:#1e3a5f;">${label} Templates</div><div style="font-size:11px;color:#64748b;">${temps.length} template${temps.length!==1?'s':''}</div></div>
    <button onclick="window.openTplForm('${prog}')" style="padding:6px 14px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">+ Add</button>
  </div>
  <div style="flex:1;overflow-y:auto;padding:12px 14px;background:#f8fafc;">${formHtml}${temps.length?templateCards:'<div style="font-size:12px;color:#94a3b8;text-align:center;padding:20px;">No templates for this program yet. Click + Add to create one.</div>'}</div>`;
}

window.selectCommTemplate=function(prog){
  commsTemplateSelected=prog;
  commsTplFormVisible=false;
  commsTplEditId=null;
  commsMobileView='thread';
  renderSms();
};

window.openTplForm=function(prog,id){
  commsTplFormVisible=true;
  commsTplEditId=id||null;
  commsTemplateSelected=prog;
  renderSms();
  setTimeout(()=>document.getElementById('tplFormName')?.focus(),50);
};

window.closeTplForm=function(){
  commsTplFormVisible=false;
  commsTplEditId=null;
  renderSms();
};

window.saveTplForm=async function(prog){
  const name=(document.getElementById('tplFormName')?.value||'').trim();
  const body=(document.getElementById('tplFormBody')?.value||'').trim();
  if(!name){toast('Enter a template name','error');return;}
  if(!body){toast('Enter a message body','error');return;}
  if(commsTplEditId){
    const {error}=await supabase.from('group_message_templates').update({name,body}).eq('id',commsTplEditId);
    if(error){toast('Error saving: '+error.message,'error');return;}
    toast('Template updated','success');
  } else {
    const {data,error}=await supabase.from('group_message_templates').insert({list_id:prog,name,body}).select().single();
    if(error){toast('Error saving: '+error.message,'error');return;}
    if(data){
      const existing=getSortedTemplates(prog).map(t=>t.id);
      saveTplOrder(prog,[...existing,data.id]);
    }
    toast('Template added','success');
  }
  await loadGroupTemplates();
  commsTplFormVisible=false;
  commsTplEditId=null;
  renderSms();
};

window.moveTplUp=function(prog,id){
  const ids=getSortedTemplates(prog).map(t=>t.id);
  const idx=ids.indexOf(id);
  if(idx<=0) return;
  [ids[idx-1],ids[idx]]=[ids[idx],ids[idx-1]];
  saveTplOrder(prog,ids);
  renderSms();
};

window.moveTplDown=function(prog,id){
  const ids=getSortedTemplates(prog).map(t=>t.id);
  const idx=ids.indexOf(id);
  if(idx<0||idx>=ids.length-1) return;
  [ids[idx+1],ids[idx]]=[ids[idx],ids[idx+1]];
  saveTplOrder(prog,ids);
  renderSms();
};

window.copyTemplateText=function(prog,id){
  const t=getSortedTemplates(prog).find(x=>x.id===id);
  if(!t){toast('Template not found','error');return;}
  if(typeof copyText==='function'){copyText(t.body,'Template');return;}
  navigator.clipboard&&navigator.clipboard.writeText(t.body).then(()=>toast('Template copied','success')).catch(()=>toast('Copy failed','error'));
};

async function loadGroupTemplates(){
  const {data,error}=await supabase.from('group_message_templates').select('*').order('created_at');
  if(!error&&data){
    groupTemplatesCache={};
    data.forEach(r=>{
      if(!groupTemplatesCache[r.list_id]) groupTemplatesCache[r.list_id]=[];
      groupTemplatesCache[r.list_id].push(r);
    });
  }
}
function getGroupTemplates(listId){return groupTemplatesCache[listId]||[];}

window.toggleTplSaveForm=function(listId){
  const el=document.getElementById('tplSaveForm_'+listId);
  if(el) el.style.display=el.style.display==='none'?'block':'none';
};

window.saveGroupTemplateNamed=async function(listId){
  const nameEl=document.getElementById('tplNameInput_'+listId);
  const name=(nameEl?.value||'').trim();
  if(!name){toast('Enter a template name','error');return;}
  const bodyEl=document.getElementById('groupComposeBox');
  const body=(bodyEl?.value||'').trim();
  if(!body){toast('Type a message in the compose box first','error');return;}
  const {error}=await supabase.from('group_message_templates').insert({list_id:listId,name,body});
  if(error){toast('Error saving template: '+error.message,'error');return;}
  await loadGroupTemplates();
  toast('Template saved','success');
  renderSms();
};

window.loadGroupTemplate=function(listId,id){
  const t=getGroupTemplates(listId).find(x=>x.id===id);
  if(!t){toast('Template not found','error');return;}
  const el=document.getElementById('groupComposeBox');
  if(el){el.value=t.body;window._updateCharCount&&window._updateCharCount('groupComposeBox');}
  toast('"'+t.name+'" loaded','success');
};

window.deleteGroupTemplate=async function(listId,id){
  if(!confirm('Delete this template?')) return;
  const {error}=await supabase.from('group_message_templates').delete().eq('id',id);
  if(error){toast('Error deleting template: '+error.message,'error');return;}
  const order=getTplOrder(listId);
  if(order) saveTplOrder(listId,order.filter(x=>x!==id));
  await loadGroupTemplates();
  toast('Template deleted','success');
  renderSms();
};

// ── expose entry points back to the inline app (reverse bridge) ──
window.loadSmsMessages=loadSmsMessages;
window.loadCommsLists=loadCommsLists;
window.loadGroupTemplates=loadGroupTemplates;
window.processStopReplies=processStopReplies;
window.startCommsRealtime=startCommsRealtime;
window.renderSms=renderSms;
window.updateCommsBadge=updateCommsBadge;
window.getSmsMessages=function(){ return smsMessages; };
window.resetCommsUnread=function(){ commsUnreadCount=0; updateCommsBadge(); };

})();
