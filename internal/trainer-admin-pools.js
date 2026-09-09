(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  let refreshTimer = null;

  const isNoTtt = value => /^(HRD Corp TTT Eligibility:\s*No|HRD Corp TTT:\s*No)$/i.test(String(value || '').trim());
  const qualificationLabel = value => {
    const text = String(value || '');
    if (isNoTtt(text)) return 'No TTT / Exemption';
    if (/Type:\s*HRD Corp TTT Exempted/i.test(text)) return 'TTT Exempted';
    if (/HRD Corp TTT Eligibility:\s*Yes/i.test(text) || /^HRD Corp TTT:\s*Yes/i.test(text)) return 'HRD Corp TTT';
    return 'Not stated';
  };
  const rateText = row => {
    if (!row) return '-';
    if (row.rate_basis === 'NEGOTIABLE') return 'Negotiable';
    const labels = {HOURLY:'hour',HALF_DAY:'half day',DAILY:'day',PROJECT:'project'};
    return row.rate_amount != null ? `RM ${Number(row.rate_amount).toLocaleString('en-MY')} / ${labels[row.rate_basis] || row.rate_basis || '-'}` : '-';
  };

  function badge(text, cls='blue') {
    return `<span class="badge ${cls}">${esc(text)}</span>`;
  }

  function ensureBlocks() {
    const trainerList = document.getElementById('adminTrainerList');
    if (!trainerList) return null;
    let host = document.getElementById('adminTalentPoolsBlock');
    if (!host) {
      host = document.createElement('div');
      host.id = 'adminTalentPoolsBlock';
      host.style.marginTop = '1.25rem';
      const activation = document.getElementById('adminActivationChecklistBlock');
      (activation || trainerList).insertAdjacentElement('afterend', host);
    }
    return host;
  }

  async function load() {
    const { data: auth } = await client.auth.getUser();
    if (!auth?.user || auth.user.app_metadata?.role !== 'admin') return;
    const [pRes,oRes,cRes,dRes] = await Promise.all([
      client.from('profiles').select('id,full_name,email,phone,state,collaboration_status').limit(500),
      client.from('trainer_onboarding').select('trainer_id,ttt_status,onboarding_completed_at').limit(500),
      client.from('trainer_consultancy_profiles').select('*').limit(500),
      client.from('trainer_documents').select('trainer_id,document_type,programme_id,verification_status,created_at').is('programme_id',null).order('created_at',{ascending:false}).limit(2000)
    ]);
    if (pRes.error || oRes.error || cRes.error || dRes.error) return;

    const profiles = (pRes.data || []).filter(x => x.id !== auth.user.id);
    const onboarding = oRes.data || [];
    const consultancy = cRes.data || [];
    const documents = dRes.data || [];
    const onboardingById = Object.fromEntries(onboarding.map(x => [x.trainer_id,x]));
    const consultancyById = Object.fromEntries(consultancy.map(x => [x.trainer_id,x]));

    function latestDoc(trainerId,type) {
      return documents.filter(d => d.trainer_id === trainerId && d.document_type === type)
        .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0] || null;
    }

    const waiting = profiles.filter(p => {
      const o = onboardingById[p.id];
      return Boolean(o?.onboarding_completed_at) && isNoTtt(o?.ttt_status) && p.collaboration_status !== 'ACTIVE' && p.collaboration_status !== 'REJECTED';
    });
    const consultants = profiles.filter(p => consultancyById[p.id]?.available_for_consultancy);

    const host = ensureBlocks();
    if (!host) return;
    host.innerHTML = `
      <section id="adminWaitingListSection" class="admin-pool-section">
        <div class="panel-header" style="margin-top:1rem"><div><h3 style="margin:0">Trainer Waiting List</h3><div class="muted">Completed onboarding but currently without HRD Corp TTT or an official TTT exemption. These trainers are not included in automatic training opportunity matching until eligible for activation.</div></div></div>
        <div class="list" id="adminWaitingList">
          ${waiting.length ? waiting.map(p => {
            const cv = latestDoc(p.id,'RESUME_CV');
            const c = consultancyById[p.id];
            return `<div class="list-card"><div class="list-card-top"><div><h3>${esc(p.full_name || 'Trainer')}</h3><div class="meta"><span>${esc(p.email || '')}</span><span>${esc(p.phone || '')}</span><span>${esc(p.state || '')}</span></div></div>${badge('WAITING LIST','amber')}</div><div class="meta"><span>TTT: <strong>No TTT / Exemption</strong></span><span>Resume: <strong>${esc(cv?.verification_status || 'NOT UPLOADED')}</strong></span><span>Consultancy: <strong>${c?.available_for_consultancy ? 'Available' : 'Not opted in'}</strong></span></div></div>`;
          }).join('') : '<div class="empty">No trainers are currently in the waiting list.</div>'}
        </div>
      </section>

      <section id="adminConsultancyPoolSection" class="admin-pool-section">
        <div class="panel-header" style="margin-top:1.4rem"><div><h3 style="margin:0">Consultancy Pool</h3><div class="muted">Optional consultant profiles. Consultancy availability is independent from Active Trainer status and HRD Corp TTT status.</div></div></div>
        <div class="list" id="adminConsultancyPool">
          ${consultants.length ? consultants.map(p => {
            const c = consultancyById[p.id];
            const o = onboardingById[p.id];
            return `<div class="list-card"><div class="list-card-top"><div><h3>${esc(p.full_name || 'Consultant')}</h3><div class="meta"><span>${esc(p.email || '')}</span><span>${esc(p.phone || '')}</span><span>${esc(p.state || '')}</span></div></div>${badge('CONSULTANT POOL','green')}</div><div class="meta"><span>Trainer status: <strong>${esc(String(p.collaboration_status || '').replaceAll('_',' '))}</strong></span><span>TTT: <strong>${esc(qualificationLabel(o?.ttt_status))}</strong></span><span>Indicative rate: <strong>${esc(rateText(c))}</strong></span></div><div style="margin-top:.7rem"><strong>Consultancy Areas / Services</strong><p>${esc(c.consultancy_summary || '-')}</p><strong>Typical Deliverables</strong><p>${esc(c.deliverables_summary || '-')}</p>${c.rate_notes ? `<strong>Rate Notes</strong><p>${esc(c.rate_notes)}</p>` : ''}</div></div>`;
          }).join('') : '<div class="empty">No trainers have opted into the consultancy pool yet.</div>'}
        </div>
      </section>`;
  }

  function schedule() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(load, 180);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await load();
    const trainerList = document.getElementById('adminTrainerList');
    if (trainerList) new MutationObserver(schedule).observe(trainerList,{childList:true,subtree:true});
    setTimeout(load,600);
    setTimeout(load,1500);
  });
})();