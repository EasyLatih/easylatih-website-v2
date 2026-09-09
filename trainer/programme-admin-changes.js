(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const fmt = v => v ? new Intl.DateTimeFormat('en-MY',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)) : '-';
  const labels = {
    title:'Programme Title', category:'Category', training_type:'Training Type', programme_overview:'Programme Overview',
    learning_objectives:'Learning Objectives', learning_outcomes:'Learning Outcomes', target_participants:'Target Participants',
    prerequisites:'Prerequisites', duration:'Duration', delivery_method:'Delivery Method', training_methodology:'Training Methodology',
    modules:'Modules / Topics', assessment_method:'Assessment Method', maximum_participants:'Maximum Participants',
    venue_requirements:'Venue / Equipment Requirements'
  };

  function displayValue(value) {
    if (value === null || value === undefined || value === '') return '<span class="muted">Not specified</span>';
    if (Array.isArray(value)) {
      const items = value.map(item => {
        if (item && typeof item === 'object') return item.title || item.name || JSON.stringify(item);
        return String(item);
      }).filter(Boolean);
      return items.length ? `<ul style="margin:.3rem 0;padding-left:1.2rem">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted">None</span>';
    }
    if (typeof value === 'object') return `<pre style="white-space:pre-wrap;margin:.25rem 0">${esc(JSON.stringify(value,null,2))}</pre>`;
    return `<div style="white-space:pre-wrap">${esc(value)}</div>`;
  }

  function renderChange(change) {
    const entries = Object.entries(change.changes || {});
    return `<div class="list-card" style="border-left:4px solid #0d3b66">
      <div class="list-card-top"><div><h3>${esc(change.programmeTitle || 'Programme updated')}</h3><div class="meta"><span>EasyLatih correction</span><span>Version ${esc(change.from_version)} → ${esc(change.to_version)}</span><span>${esc(fmt(change.created_at))}</span></div></div><span class="badge blue">UPDATED BY EASYLATIH</span></div>
      ${change.note ? `<div class="alert alert-info" style="margin:.7rem 0"><strong>Admin note:</strong> ${esc(change.note)}</div>` : ''}
      <div class="muted" style="margin-bottom:.6rem">EasyLatih corrected the submitted programme directly so the review process does not need to wait for a resubmission. The latest version below is now the working version.</div>
      ${entries.map(([field,diff]) => `<details style="border-top:1px solid #eef2f7;padding:.65rem 0"><summary style="cursor:pointer;font-weight:700">${esc(labels[field] || field.replaceAll('_',' '))}</summary><div class="review-grid" style="margin-top:.55rem"><div><strong>Before</strong>${displayValue(diff?.before)}</div><div><strong>After</strong>${displayValue(diff?.after)}</div></div></details>`).join('')}
    </div>`;
  }

  async function loadChanges() {
    const {data:userData,error:userError} = await client.auth.getUser();
    const user = userData?.user;
    if (userError || !user) return;

    const {data:logs,error} = await client.from('programme_admin_edits')
      .select('id,programme_id,from_version,to_version,changes,note,created_at')
      .eq('trainer_id',user.id)
      .order('created_at',{ascending:false})
      .limit(30);
    if (error || !(logs || []).length) return;

    const ids = [...new Set((logs || []).map(x=>x.programme_id))];
    const {data:programmes} = await client.from('programmes').select('id,title').in('id',ids);
    const titleMap = {};
    (programmes || []).forEach(p => titleMap[p.id] = p.title);

    const section = document.querySelector('[data-section="programmes"]');
    const list = document.getElementById('programmeList');
    if (!section || !list) return;
    let block = document.getElementById('programmeAdminChangesBlock');
    if (!block) {
      block = document.createElement('div');
      block.id = 'programmeAdminChangesBlock';
      block.style.marginBottom = '1rem';
      list.insertAdjacentElement('beforebegin',block);
    }
    const rows = (logs || []).map(x => ({...x, programmeTitle:titleMap[x.programme_id] || 'Programme'}));
    block.innerHTML = `<div class="panel-header"><div><h3 style="margin:0">Programme Updates by EasyLatih</h3><div class="muted">Corrections made directly by EasyLatih are shown here with the exact before/after values.</div></div></div><div class="list">${rows.map(renderChange).join('')}</div>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(loadChanges, 500);
  });
})();
