"use strict";
const Preview = (() => {
  const copy = x => JSON.parse(JSON.stringify(x));
  function profileError(p) {
    if (!p || !Array.isArray(p.objectives) || p.objectives.length < 4 || p.objectives.length > 7) return 'Use four base objectives and up to three custom priorities.';
    const ids = p.objectives.map(x => x.id);
    if (new Set(ids).size !== ids.length || !['financial','speed','strategic','reversibility'].every(x => ids.includes(x)) || ids.some(x => !['financial','speed','strategic','reversibility','custom-1','custom-2','custom-3'].includes(x))) return 'Invalid objective list.';
    if (p.objectives.some(x => !Number.isInteger(x.weight) || x.weight < 0 || x.weight > 100 || x.weight % 5)) return 'Use weights from 0 to 100, in steps of five.';
    if (p.objectives.reduce((s,x) => s+x.weight,0) !== 100) return 'Allocate exactly 100% to continue.';
    if (p.objectives.some(x => typeof x.label !== 'string' || typeof x.description !== 'string' || x.label.length>100 || x.description.length>600 || (x.weight && (!x.label.trim() || !x.description.trim())))) return 'Give each weighted priority a name and description.';
    if (typeof p.horizon !== 'string' || !p.horizon.trim() || p.horizon.length>1000 || typeof p.risk_tolerance !== 'string' || !p.risk_tolerance.trim() || p.risk_tolerance.length>1000) return 'State the horizon and downside tolerance, or explicitly say unknown.';
    if (!Array.isArray(p.non_negotiables) || p.non_negotiables.length>3 || p.non_negotiables.some(x => typeof x!=='string' || !x.trim() || x.length>600)) return 'Use up to three additional limits, one per line.';
    return '';
  }
  function fingerprint(p) { return JSON.stringify(p); }
  function validDraft(p) {
    if(!p || !Array.isArray(p.objectives) || p.objectives.length<4 || p.objectives.length>7) return false;
    const ids=p.objectives.map(x=>x?.id),allowed=['financial','speed','strategic','reversibility','custom-1','custom-2','custom-3'];
    return new Set(ids).size===ids.length && ['financial','speed','strategic','reversibility'].every(x=>ids.includes(x)) && ids.every(x=>allowed.includes(x)) && p.objectives.every(x=>typeof x.label==='string' && x.label.length<=100 && typeof x.description==='string' && x.description.length<=600 && (x.weight===null || Number.isFinite(x.weight))) && typeof p.horizon==='string' && typeof p.risk_tolerance==='string' && Array.isArray(p.non_negotiables) && p.non_negotiables.every(x=>typeof x==='string');
  }
  function rankedInsights(data,p) {
    const w = Object.fromEntries(p.objectives.map(x => [x.id,x.weight]));
    const attention=x=>Math.max(...(x.objectives||[x.objective]).map(id=>w[id]||0));
    return data.insights.map((x,i) => ({...x,order:i})).sort((a,b) => attention(b)-attention(a) || a.order-b.order);
  }
  function suggestedRoute(selections) {
    const active = id => selections[id] && selections[id]!=='park';
    if (active('window') || active('economics')) return 'window';
    if (active('grading') || active('ceiling')) return 'grading';
    if (active('reuse')) return 'exit';
    return 'window';
  }
  function verificationKey(s) {
    return JSON.stringify([s.profile,s.route,s.selections,s.note||'',s.brief||'',s.file||null]);
  }
  function assess(data,state) {
    const route=copy(data.routes.find(x=>x.id==='combined'));
    const matches=example=>state.profile.objectives.length===data.profile.objectives.length && state.profile.objectives.every(row=>{
      const base=data.profile.objectives.find(x=>x.id===row.id);
      return base && row.label===base.label && row.description===base.description && row.weight===(example.weights[row.id]||0);
    }) && ['horizon','risk_tolerance','non_negotiables'].every(k=>JSON.stringify(state.profile[k])===JSON.stringify(data.profile[k]));
    const profileExample=Object.keys(data.priority_examples).find(k=>matches(data.priority_examples[k]))||'custom';
    let rationale=profileExample==='custom'?'Your priorities or constraints differ from the two prepared examples. This combined plan is a reference recommendation pending assessment against your brief; no tailored fit is claimed.':data.priority_examples[profileExample].rationale;
    if(state.selections.grading==='verify' && profileExample==='owner'){
      rationale='Speed to value (35%) still matters, but your grading challenge makes a recoverability and staffing check the next step before trial approval. Credibility (25%) rules out committing on an unverified estimate. Strategy (30%) preserves the assets and booth option; reversibility (10%) limits the initial commitment. Once recovery and cover are credible, proceed with the bounded shadow trial.';
    }else if(state.selections.grading==='verify' && profileExample==='reversible'){
      rationale='Reversibility (60%) and your grading challenge both favour checking recoverability and staffing before authorising the trial. Speed carries 10%, so accept a short delay rather than commit on an unverified recovery estimate. Increasing speed would not resolve that evidence gap; a credible recovery estimate and staffing plan would reopen trial approval.';
    }
    const branches=[];
    for(const item of data.insights){
      const action=state.selections[item.id];
      if(!action)continue;
      if(action==='park'){branches.push({id:item.id,action,question:item.question,evidence:'Set aside for further development.',outcome:'Material constraints remain in the recommendation and verification.'});continue;}
      const branch=data.branches[item.id]?.[action];
      branches.push({id:item.id,action,...(branch||{question:item.question,evidence:item[action],outcome:'Captured for investigation; no additional prepared result.'})});
    }
    if(profileExample==='reversible' || state.selections.grading==='verify'){
      route.decision='Check the recoverable B-grade share, customer acceptance and staffing before authorising the three-week trial. Preserve the owned assets; avoid automatic licence renewal. Keep the booth decision open only until its supplier cutoff.';
      route.actions[0]=['Before trial approval','Priya and QA','Split false B grades from rejects and cost cover and retrieval. If net recovery is credible, prepare the shadow trial.'];
    }
    if(state.selections.economics==='verify')route.decision+=' Hold any booth purchase until its claimed benefits survive the matched-evidence check.';
    else if(state.selections.economics==='develop')route.decision+=' Prepare a conditional booth value case before the cutoff; do not issue a purchase order yet.';
    if(profileExample==='reversible' && state.selections.grading==='develop'){
      branches.find(x=>x.id==='grading').outcome='Your request develops the trial design. With reversibility first, check the recoverable share and staffing before committing to the three-week trial.';
    }
    const alternative=copy(data.routes.find(x=>x.id===state.route)||data.routes[0]);
    const alternativeAssessment={window:'Keeping the booth option open is sensible, but insufficient alone. Also assess grading recovery and avoid an unjustified licence renewal.',grading:'Grading recovery belongs in the plan. It does not settle the licence or booth deadlines; retain those decisions alongside it.',exit:'Non-renewal preserves cash but does not capture the grading opportunity. Retain the assets and assess recovery rather than treating exit as the whole answer.',combined:'This preference fits the combined plan, subject to the trial and purchase conditions below.'}[alternative.id];
    return {route,alternative,alternativeAssessment,profileExample,rationale,branches,verification:copy(data.verification),grading:copy(data.grading_economics)};
  }
  function makeReport(data,state) {
    const error=profileError(state.profile);
    if (error || state.accepted!==fingerprint(state.profile)) throw new Error(error || 'Confirm your priorities first.');
    if(state.verified!==verificationKey(state))throw new Error('Review the verification example after your latest changes.');
    return copy({...assess(data,state),profile:state.profile,selections:state.selections,note:state.note||'',hasAdditionalInput:!!(state.note||state.file||state.brief!==data.brief),shared:data.report_shared,prepared:true});
  }
  return {copy,profileError,validDraft,fingerprint,rankedInsights,suggestedRoute,verificationKey,assess,makeReport};
})();
if (typeof module!=='undefined') module.exports=Preview;

if (typeof document!=='undefined') {
  const $=s=>document.querySelector(s),data=JSON.parse($('#preview-data').textContent),key='second-look-public-demo-v1';
  const names=['The decision','Your priorities','Insights & steering','Develop a direction','Independent verification','Decision report'];
  const ids=['brief','priorities','insights','direction','verification','report'];
  const fresh=()=>({version:2,step:0,brief:data.brief,profile:Preview.copy(data.profile),accepted:null,selections:{},note:'',file:null,route:'window',routeChosen:false,verified:null,report:null});
  let state=fresh(),filter='All';
  try { const saved=JSON.parse(localStorage.getItem(key)||'null');
    if(saved && saved.version===2 && typeof saved.brief==='string' && typeof saved.note==='string' && saved.selections && Object.keys(saved.selections).every(id=>data.insights.some(x=>x.id===id)) && Object.values(saved.selections).every(x=>['develop','verify','park'].includes(x)) && Preview.validDraft(saved.profile)) {
      state={...fresh(),...saved,report:null};
      if(state.accepted!==Preview.fingerprint(state.profile)) state.accepted=null;
      // Rebuild only a previously chosen prepared example, never infer new advice.
      if(saved.report && state.accepted && state.verified===Preview.verificationKey(state) && data.routes.some(x=>x.id===state.route))state.report=Preview.makeReport(data,state);
    }
  } catch { /* An invalid local draft cannot alter the fixed case or source record. */ }
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function save(){try{localStorage.setItem(key,JSON.stringify(state));}catch{message('This browser cannot save the draft. Download the brief to keep your choices.');}}
  function message(text){$('#notice').textContent=text;$('#notice').hidden=!text;}
  function changed(){state.verified=null;state.report=null;save();}
  function invalidate(){state.accepted=null;changed();}
  function show(step){
    if(step>=2 && state.accepted!==Preview.fingerprint(state.profile)){message('Confirm your priorities before exploring the insights.');step=1;}
    if(step===5 && (!state.report || state.verified!==Preview.verificationKey(state))){message('Review the verification example after your latest changes.');step=4;}
    state.step=step;document.querySelectorAll('.screen').forEach((n,i)=>n.hidden=i!==step);
    document.querySelectorAll('[data-step]').forEach(n=>{const i=Number(n.dataset.step);n.classList.toggle('active',i===step);n.classList.toggle('done',i<step);if(i===step)n.setAttribute('aria-current','step');else n.removeAttribute('aria-current');});
    $('#step-label').textContent=names[step];location.hash=ids[step];
    if(step===2)renderInsights();if(step===3)renderDirection();if(step===4)renderVerification();if(step===5)renderReport();
    save();window.scrollTo({top:0,behavior:'instant'});
  }
  function button(text,fn,cls='text-button'){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
  function modal(title,content){$('#dialog-title').textContent=title;$('#dialog-content').replaceChildren(content);$('#detail-dialog').showModal();}
  function table(headers,rows){const t=el('table'),head=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th',h)));head.append(tr);t.append(head);const body=el('tbody');rows.forEach(row=>{const r=el('tr');row.forEach(c=>r.append(el('td',c)));body.append(r);});t.append(body);return t;}
  function renderWeights(){
    $('#weights').replaceChildren();
    // Keep the user's active objectives first; financial return remains available.
    const order=['speed','strategic','custom-1','reversibility','financial','custom-2','custom-3'];
    for(const row of [...state.profile.objectives].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id))){
      const box=el('div',undefined,'weight-row'),description=el('div'),value=el('div',undefined,'weight-value');
      if(row.id.startsWith('custom')){
        const label=el('label','Priority name');label.htmlFor='label-'+row.id;const input=el('input');input.type='text';input.id=label.htmlFor;input.value=row.label;input.maxLength=100;input.oninput=()=>{row.label=input.value;invalidate();allocation();};
        const dl=el('label','What does it mean?');dl.htmlFor='desc-'+row.id;const detail=el('input');detail.type='text';detail.id=dl.htmlFor;detail.value=row.description;detail.maxLength=600;detail.oninput=()=>{row.description=detail.value;invalidate();allocation();};description.append(label,input,dl,detail);
      }else{const label=el('label',row.label);label.htmlFor='weight-'+row.id;description.append(label,el('p',row.description));}
      const label=el('label','Weight %');label.htmlFor='weight-'+row.id;const input=el('input');input.id=label.htmlFor;input.type='number';input.min=0;input.max=100;input.step=5;input.value=row.weight;input.setAttribute('aria-label','Weight for '+(row.label||row.id));input.oninput=()=>{row.weight=input.value===''?null:Number(input.value);invalidate();allocation();};value.append(label,input);box.append(description,value);$('#weights').append(box);
    }
    $('#horizon').value=state.profile.horizon;$('#risk').value=state.profile.risk_tolerance;$('#limits').value=state.profile.non_negotiables.join('\n');
    $('#add-priority').disabled=state.profile.objectives.filter(x=>x.id.startsWith('custom')).length===3;allocation();
  }
  function allocation(){
    const total=state.profile.objectives.reduce((s,x)=>s+(Number.isFinite(x.weight)?x.weight:0),0),error=Preview.profileError(state.profile);
    $('#total').textContent=total+'% of 100%';$('#allocation-status').textContent=error || (state.accepted?'Priorities confirmed.':'Ready to confirm.');$('#total').parentElement.classList.toggle('invalid',!!error);$('#accept').disabled=!!error;
    const labels=state.profile.objectives.filter(x=>x.weight).map(x=>x.label.toLowerCase().trim());$('#overlap-warning').textContent=new Set(labels).size!==labels.length?'Some priorities have the same name. Check for double counting.':'Speed means reaching financial or operating value sooner. Quick learning alone is not the benefit.';
  }
  function renderInsights(){
    const top=[...state.profile.objectives].filter(x=>x.weight).sort((a,b)=>b.weight-a.weight)[0];
    $('#priority-focus').textContent='Your strongest priority: '+top.label+' ('+top.weight+'%). Prepared insights are ordered by the priority they address.';
    $('#role-tabs').replaceChildren();for(const role of ['All',...data.insights.map(x=>x.role)]){const b=button(role,()=>{filter=role;renderInsights();});b.setAttribute('aria-pressed',String(filter===role));$('#role-tabs').append(b);}
    $('#insight-cards').replaceChildren();
    for(const item of Preview.rankedInsights(data,state.profile).filter(x=>filter==='All'||x.role===filter)){
      const card=el('article',undefined,'insight-card'+(state.selections[item.id]?' selected':''));
      const role=el('div',undefined,'role');role.append(el('span',item.initial,'avatar'),el('span',item.role));card.append(role,el('h2',item.title),el('p',item.finding),el('p',item.consequence,'consequence'));
      const details=el('details');details.append(el('summary','Evidence and calculation'),el('p',item.evidence),el('p','Case sections '+item.source_sections.join(', '),'hint'));card.append(details);
      const actions=el('div',undefined,'insight-actions');for(const [action,label] of [['develop','Develop this'],['verify','Challenge this'],['park','Set aside']]){const b=button(label,()=>{if(state.selections[item.id]===action)delete state.selections[item.id];else state.selections[item.id]=action;changed();renderInsights();},'');b.setAttribute('aria-label',label+': '+item.title);b.setAttribute('aria-pressed',String(state.selections[item.id]===action));actions.append(b);}card.append(actions);$('#insight-cards').append(card);
    }
    $('#steer-summary').replaceChildren();const selected=data.insights.filter(x=>state.selections[x.id]);
    if(!selected.length)$('#steer-summary').append(el('p','Select an insight to give the investigation a direction.','empty'));
    for(const item of selected){const action=state.selections[item.id],row=el('div',undefined,'steer-item');row.append(el('small',action==='develop'?'Develop':action==='verify'?'Challenge':'Set aside'),el('p',item.question));$('#steer-summary').append(row);}
    $('#to-direction').disabled=!selected.some(x=>state.selections[x.id]!=='park');$('#steer-note').value=state.note;
  }
  function renderDirection(){
    if(!state.routeChosen)state.route='combined';
    $('#route-cards').replaceChildren();for(const route of data.routes){const b=button('',()=>{state.route=route.id;state.routeChosen=true;changed();renderDirection();},'route-card');b.setAttribute('role','radio');b.setAttribute('aria-checked',String(state.route===route.id));b.setAttribute('aria-label',route.title);b.append(el('span',undefined,'radio-dot'),el('h2',route.title),el('p',route.summary),el('small',route.cost));$('#route-cards').append(b);}
    const route=data.routes.find(x=>x.id===state.route);$('#route-test').textContent=route.change;$('#work-plan').replaceChildren();let n=0;
    for(const branch of Preview.assess(data,state).branches){
      const row=el('div',undefined,'work-item'),body=el('div');
      body.append(el('strong',branch.question),el('p','Evidence sought: '+branch.evidence),el('p',branch.outcome,'consequence'));
      row.append(el('span',String(++n).padStart(2,'0')),body);$('#work-plan').append(row);
    }
    if(!n)$('#work-plan').append(el('p','Choose an insight to develop or challenge.','hint'));
    if(state.note)$('#work-plan').append(el('h3','Your additional instruction'),el('p',state.note),el('p','Saved in the brief; not answered by the prepared example.','hint'));
  }
  function renderVerification(){
    const a=Preview.assess(data,state);
    $('#verification-summary').textContent='Recommendation after these prepared checks: '+a.route.decision;
    $('#verification-cards').replaceChildren();
    for(const check of a.verification){
      const card=el('article',undefined,'paper');
      card.append(el('small',check.status,'check-status'),el('h2',check.area),el('h3','Draft claim'),el('p',check.before),el('h3','Correction or unresolved issue'),el('p',check.after),el('p',check.source,'hint'));
      $('#verification-cards').append(card);
    }
  }
  function renderReport(){
    const r=state.report,report=$('#report-paper');report.replaceChildren();
    const meta=el('div',undefined,'report-meta');meta.append(el('span','To Priya Nandakumar, Operations Manager'),el('span','26 October 2026'));
    report.append(meta,el('h1',r.route.title),el('p',r.route.decision,'decision'),el('h2','Why this fits your priorities'),el('p',r.rationale),el('h2','Your preferred direction'),el('p',r.alternative.title+'. '+r.alternativeAssessment));
    report.append(el('h2','Value worth testing'),el('p',r.grading.ceiling),el('p',r.grading.sensitivity,'basis'),el('p','Booth: A$44k upfront. Annual cash could gain A$40k to A$50k if claims improve without extra B grades, or lose A$21k to A$31k if B grades rise as on Line 1. These are sensitivities, not forecasts.'));
    if(r.branches.length){report.append(el('h2','How your steering changed the work'));for(const branch of r.branches)report.append(el('p',branch.outcome));}
    if(r.hasAdditionalInput)report.append(el('p','Your edited brief, note or attachment remains open for investigation; this prepared report does not answer it.','basis'));
    report.append(el('h2','Verification and open issues'),el('p','The grading figure is a gross ceiling, not a saving. Recoverability, customer acceptance and booth causality remain open. The 600-panel trial cannot establish non-worsening misses; production grades stay unchanged.'),el('h2','Decisions and owners'),table(['When','Owner','Action'],r.route.actions),el('h2','What would change the recommendation'),el('p',r.route.change));
    const evidence=el('details');evidence.append(el('summary','Economics and constraints'),table(['Booth scenario','Annual cash effect','Investment'],r.shared.economics),el('p',r.shared.economics_note),el('p',r.shared.guardrail));report.append(evidence);
    $('#report-evidence').replaceChildren(el('p','Prepared recommendation assessed separately from your preferred direction. No live investigator or verifier ran.'),el('p',data.provenance.authorship),el('p',data.provenance.capability),button('Read the source case',()=>modal('Tallowwood source case',el('pre',data.case,'source-text'))));
  }
  function download(name,body,type){const a=el('a');a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function instructionBrief(){return {schema_version:1,scope:'Product preview brief. No model execution or human approval of case findings.',decision:state.brief,decision_priorities:state.profile,priorities_confirmed:state.accepted===Preview.fingerprint(state.profile),steering:data.insights.filter(x=>state.selections[x.id]).map(x=>({insight:x.id,role:x.role,action:state.selections[x.id],question:x.question})),additional_instruction:state.note,attached_note:state.file,preferred_direction:state.route,prepared_assessment:Preview.assess(data,state),verification_example_viewed:state.verified===Preview.verificationKey(state)};}
  document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{message('');show(Number(b.dataset.step));});
  $('#brief-text').value=state.brief;$('#brief-text').oninput=e=>{state.brief=e.target.value;changed();};
  $('#to-priorities').onclick=()=>show(1);
  for(const [id,keyName] of [['horizon','horizon'],['risk','risk_tolerance']])$('#'+id).oninput=e=>{state.profile[keyName]=e.target.value;invalidate();allocation();};
  $('#limits').oninput=e=>{state.profile.non_negotiables=e.target.value.split('\n').map(x=>x.trim()).filter(Boolean);invalidate();allocation();};
  $('#add-priority').onclick=()=>{const id=['custom-1','custom-2','custom-3'].find(x=>!state.profile.objectives.some(y=>y.id===x));if(id){state.profile.objectives.push({id,label:'',description:'',weight:0});invalidate();renderWeights();}};
  for(const id of ['owner','reversible'])$('#profile-'+id).onclick=()=>{
    state.profile=Preview.copy(data.profile);
    for(const row of state.profile.objectives)row.weight=data.priority_examples[id].weights[row.id]||0;
    invalidate();renderWeights();message('Prepared priority example loaded. Review and confirm it.');
  };
  $('#accept').onclick=()=>{const error=Preview.profileError(state.profile);if(error)return message(error);state.accepted=Preview.fingerprint(state.profile);state.report=null;message('');show(2);};
  $('#steer-note').oninput=e=>{state.note=e.target.value;changed();};
  $('#to-direction').onclick=()=>{message('');show(3);};
  $('#to-verification').onclick=()=>{message('');show(4);};
  $('#to-report').onclick=()=>{try{state.routeChosen=true;state.verified=Preview.verificationKey(state);state.report=Preview.makeReport(data,state);message('');show(5);}catch(e){message(e.message);}};
  $('#view-case').onclick=()=>modal('Tallowwood source case',el('pre',data.case,'source-text'));
  $('#view-audit').onclick=()=>modal('Joint quality audit',el('pre',data.case.split('## 5.')[1].split('## 6.')[0],'source-text'));
  $('#about').onclick=()=>{const content=el('div');content.append(el('p',data.provenance.authorship),el('p',data.provenance.explanation),el('p',data.provenance.capability),el('h3','Retained source records'));data.provenance.sources.forEach(x=>content.append(el('p',x,'hint')));modal('About this preview',content);};
  $('#close-dialog').onclick=()=>$('#detail-dialog').close();
  $('#reset').onclick=()=>{state=fresh();filter='All';$('#brief-text').value=state.brief;$('#file-status').textContent='';$('#note-file').value='';renderWeights();message('Walkthrough reset. Original case records are unchanged.');show(0);};
  $('#note-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>100000 || !/\.(txt|md)$/i.test(file.name)){message('Choose a TXT or Markdown note no larger than 100 KB.');return;}state.file={name:file.name,text:await file.text()};changed();$('#file-status').textContent='Added '+file.name+' to the preview brief. The case and report examples are unchanged.';};
  if(state.file)$('#file-status').textContent='Note attached: '+state.file.name;
  $('#download-brief').onclick=()=>download('second-look-steering-brief.json',JSON.stringify(instructionBrief(),null,2)+'\n','application/json');
  $('#download-report').onclick=()=>{const css='body{max-width:900px;margin:40px auto;padding:20px;font:15px/1.6 Segoe UI,Arial;color:#253c37}h1{font:32px Georgia}h2{font-size:19px}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}.report-meta,.basis{font-size:12px;color:#5e6d65}.decision{font-size:18px}.material-limit{background:#f0f4ea;padding:15px}';const report=$('#report-paper').cloneNode(true);report.querySelectorAll('details').forEach(n=>n.open=true);download('Tallowwood-'+state.report.route.id+'-example-report.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tallowwood decision report</title><style>'+css+'</style><body>'+report.outerHTML+'<footer><p class="basis">Illustrative target deliverable prepared by Codex from the retained case analysis and QA. No live analysis was run for this preview.</p></footer></body></html>','text/html');};
  $('#case-constraints').replaceChildren(...data.constraints.map(x=>el('li',x)));
  window.addEventListener('hashchange',()=>{const next=ids.indexOf(location.hash.slice(1));if(next>=0 && next!==state.step)show(next);});
  renderWeights();show(0);
}
