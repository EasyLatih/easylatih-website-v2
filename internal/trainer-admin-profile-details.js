(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const $ = id => document.getElementById(id);
  const dateFormatter = new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium' });
  const dateTimeFormatter = new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short' });
  let admin = null;
  let observer = null;
  let refreshTimer = null;
  let loading = false;

  function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
  }

  function humanise(value) {
    return hasValue(value) ? String(value).replace(/_/g, ' ').replace(/\s+/g, ' ').trim() : '';
  }

  function fmtDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
  }

  function fmtDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : dateTimeFormatter.format(date);
  }

  function safeUrl(value) {
    if (!hasValue(value)) return '';
    try {
      const url = new URL(String(value), window.location.origin);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
  }

  function addField(grid, label, value, empty = 'Not stated') {
    const item = make('div', 'admin-detail-field');
    item.appendChild(make('dt', '', label));
    const detail = make('dd');
    if (value instanceof Node) {
      detail.appendChild(value);
    } else if (hasValue(value)) {
      detail.textContent = String(value);
    } else {
      detail.appendChild(make('span', 'muted', empty));
    }
    item.appendChild(detail);
    grid.appendChild(item);
  }

  function addText(section, label, value, empty = 'Not stated') {
    const block = make('div', 'admin-text-field');
    block.appendChild(make('strong', '', label));
    block.appendChild(make('p', hasValue(value) ? '' : 'muted', hasValue(value) ? String(value) : empty));
    section.appendChild(block);
  }

  function addTags(section, label, values, empty = 'Not stated') {
    const block = make('div', 'admin-tag-group');
    block.appendChild(make('strong', '', label));
    const wrap = make('div', 'tag-wrap');
    const list = Array.isArray(values) ? values.filter(hasValue) : [];
    if (list.length) {
      list.forEach(value => wrap.appendChild(make('span', 'tag', String(value))));
    } else {
      wrap.appendChild(make('span', 'muted', empty));
    }
    block.appendChild(wrap);
    section.appendChild(block);
  }

  function addRows(section, label, rows, render, empty = 'Not submitted') {
    const block = make('div', 'admin-row-group');
    block.appendChild(make('strong', '', label));
    const list = Array.isArray(rows) ? rows.filter(row => row && typeof row === 'object') : [];
    if (!list.length) {
      block.appendChild(make('p', 'muted', empty));
    } else {
      const ul = make('ul', 'admin-detail-list');
      list.forEach(row => ul.appendChild(make('li', '', render(row))));
      block.appendChild(ul);
    }
    section.appendChild(block);
  }

  function addSection(container, title, className) {
    const section = make('section', 'admin-trainer-data-section' + (className ? ' ' + className : ''));
    section.appendChild(make('h4', '', title));
    container.appendChild(section);
    return section;
  }

  function valueOr(value, fallback) {
    return hasValue(value) ? String(value) : fallback;
  }

  function yesNo(value) {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    return '';
  }

  function linkNode(url, label) {
    const safe = safeUrl(url);
    if (!safe) return null;
    const link = make('a', 'admin-profile-link', label || safe);
    link.href = safe;
    link.target = '_blank';
    link.rel = 'noopener';
    return link;
  }

  function oneByTrainer(rows) {
    return Object.fromEntries((rows || []).map(row => [row.trainer_id, row]));
  }

  function groupedByTrainer(rows) {
    return (rows || []).reduce((grouped, row) => {
      if (!row.trainer_id) return grouped;
      (grouped[row.trainer_id] ||= []).push(row);
      return grouped;
    }, {});
  }

  function rateLabel(row) {
    if (!row) return 'Not stated';
    if (row.rate_basis === 'NEGOTIABLE') return 'Negotiable';
    const basis = { HOURLY: 'hour', HALF_DAY: 'half day', DAILY: 'day', PROJECT: 'project' };
    if (row.rate_amount === null || row.rate_amount === undefined || row.rate_amount === '') {
      return row.rate_basis ? humanise(row.rate_basis) : 'Not stated';
    }
    return 'RM ' + Number(row.rate_amount).toLocaleString('en-MY') + ' / ' + (basis[row.rate_basis] || humanise(row.rate_basis) || 'service');
  }

  function documentLabel(value) {
    return humanise(value) || 'Document';
  }

  async function viewDocument(documentId, button) {
    const oldLabel = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Opening…';
    }
    try {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Please log in again.');
      const response = await fetch(cfg.supabaseUrl + '/functions/v1/trainer-drive-upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          apikey: cfg.supabasePublishableKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'download', document_id: documentId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to open document.');
      const binary = atob(result.base64 || '');
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const blob = new Blob([bytes], { type: result.mime_type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      alert(error.message || 'Unable to open document.');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldLabel;
      }
    }
  }

  function renderDocumentList(section, documents) {
    const block = make('div', 'admin-row-group');
    block.appendChild(make('strong', '', 'Supporting documents'));
    if (!documents.length) {
      block.appendChild(make('p', 'muted', 'No supporting document submitted yet.'));
      section.appendChild(block);
      return;
    }
    const list = make('div', 'admin-document-list');
    documents.forEach(documentRow => {
      const row = make('div', 'admin-document-row');
      const info = make('div', 'admin-document-info');
      info.appendChild(make('strong', '', documentRow.file_name || documentLabel(documentRow.document_type)));
      const meta = [
        documentLabel(documentRow.document_type),
        humanise(documentRow.verification_status) || 'Pending',
        documentRow.expiry_date ? 'Expiry: ' + fmtDate(documentRow.expiry_date) : '',
        documentRow.created_at ? 'Uploaded: ' + fmtDate(documentRow.created_at) : ''
      ].filter(Boolean).join(' · ');
      info.appendChild(make('span', 'muted', meta));
      row.appendChild(info);
      const button = make('button', 'btn btn-soft', 'View document');
      button.type = 'button';
      button.addEventListener('click', () => viewDocument(documentRow.id, button));
      row.appendChild(button);
      list.appendChild(row);
    });
    block.appendChild(list);
    section.appendChild(block);
  }

  function renderProfileDetail(card, profile, context) {
    const details = card.querySelector(':scope > .card-details');
    if (!details) return;
    details.querySelector(':scope > [data-admin-trainer-full-profile]')?.remove();

    const preferences = context.preferences[profile.id];
    const onboarding = context.onboarding[profile.id];
    const etris = context.etris[profile.id];
    const consultancy = context.consultancy[profile.id];
    const documents = context.documents[profile.id] || [];
    const agreements = context.agreements[profile.id] || [];
    const block = make('div', 'admin-trainer-full-profile');
    block.dataset.adminTrainerFullProfile = '1';

    const profileSection = addSection(block, 'Profile & contact');
    const profileGrid = make('dl', 'admin-detail-grid');
    addField(profileGrid, 'Email', profile.email);
    addField(profileGrid, 'Phone', profile.phone);
    addField(profileGrid, 'State / base location', profile.state);
    addField(profileGrid, 'Collaboration status', humanise(profile.collaboration_status));
    addField(profileGrid, 'Availability', humanise(profile.availability_status));
    addField(profileGrid, 'Registered', fmtDateTime(profile.created_at));
    addField(profileGrid, 'Last profile update', fmtDateTime(profile.updated_at));
    addField(profileGrid, 'LinkedIn', linkNode(profile.linkedin_url, 'Open LinkedIn profile'));
    addField(profileGrid, 'Public trainer profile', linkNode(profile.public_trainer_profile_url, 'Open public profile'));
    profileSection.appendChild(profileGrid);
    addText(profileSection, 'Main expertise', profile.expertise_summary);
    addText(profileSection, 'Professional bio', profile.professional_bio);

    const matchingSection = addSection(block, 'Matching preferences');
    const matchingGrid = make('dl', 'admin-detail-grid');
    addField(matchingGrid, 'Public training', preferences ? yesNo(preferences.accepts_public) : '');
    addField(matchingGrid, 'In-house training', preferences ? yesNo(preferences.accepts_inhouse) : '');
    addField(matchingGrid, 'Online training', preferences ? yesNo(preferences.accepts_online) : '');
    addField(matchingGrid, 'Admin proposal limit', preferences?.proposal_limit_override ? String(preferences.proposal_limit_override) : 'Default portal limit');
    matchingSection.appendChild(matchingGrid);
    addTags(matchingSection, 'Approved categories', preferences?.categories || [], 'No approved category');
    addTags(matchingSection, 'Expertise tags', preferences?.expertise_tags || []);
    addTags(matchingSection, 'Travel states', preferences?.travel_states || [], 'Not stated');

    const onboardingSection = addSection(block, 'Onboarding & eligibility');
    const onboardingGrid = make('dl', 'admin-detail-grid');
    addField(onboardingGrid, 'Onboarding completed', fmtDateTime(onboarding?.onboarding_completed_at), 'Not completed');
    addField(onboardingGrid, 'TTT / eligibility', onboarding?.ttt_status);
    addField(onboardingGrid, 'Industry experience', onboarding?.industry_experience);
    addField(onboardingGrid, 'Photo consent', fmtDateTime(onboarding?.photo_consent_at), 'Not recorded');
    addField(onboardingGrid, 'Consent version', onboarding?.photo_consent_version);
    onboardingSection.appendChild(onboardingGrid);
    const photoUrl = safeUrl(onboarding?.profile_photo_url);
    if (photoUrl) {
      const photo = make('img', 'admin-trainer-detail-photo');
      photo.src = photoUrl;
      photo.alt = (profile.full_name || 'Trainer') + ' profile photo';
      onboardingSection.appendChild(photo);
    }

    const etrisSection = addSection(block, 'Restricted eTRiS profile', 'admin-restricted-section');
    const etrisGrid = make('dl', 'admin-detail-grid');
    addField(etrisGrid, 'IC / passport number', etris?.identity_no, 'Not submitted');
    addField(etrisGrid, 'Race', etris?.race, 'Not submitted');
    addField(etrisGrid, 'eTRiS profile updated', fmtDateTime(etris?.updated_at), 'Not submitted');
    etrisSection.appendChild(etrisGrid);
    addRows(
      etrisSection,
      'Academic qualifications',
      etris?.academic_qualifications,
      row => [row.qualification, row.year_awarded, row.institution].filter(hasValue).join(' · '),
      onboarding?.academic_qualification || 'Not submitted'
    );
    addRows(
      etrisSection,
      'Professional certifications',
      etris?.professional_certifications,
      row => [row.certification, row.certification_body, row.year_awarded].filter(hasValue).join(' · '),
      onboarding?.professional_certifications || 'Not submitted'
    );
    addRows(
      etrisSection,
      'Career experience',
      etris?.career_experience,
      row => [[row.year_from, row.year_to].filter(hasValue).join('–'), row.position, row.company_organization].filter(hasValue).join(' · '),
      onboarding?.working_experience || 'Not submitted'
    );
    addRows(
      etrisSection,
      'Training experience',
      etris?.training_experience,
      row => [[row.year_from, row.year_to].filter(hasValue).join('–'), row.training_program_conducted].filter(hasValue).join(' · '),
      onboarding?.training_experience || 'Not submitted'
    );

    const consultancySection = addSection(block, 'Consultancy profile');
    const consultancyGrid = make('dl', 'admin-detail-grid');
    addField(consultancyGrid, 'Available for consultancy', consultancy ? yesNo(consultancy.available_for_consultancy) : '', 'Not submitted');
    addField(consultancyGrid, 'Indicative rate', rateLabel(consultancy), 'Not stated');
    addField(consultancyGrid, 'Rate basis', humanise(consultancy?.rate_basis), 'Not stated');
    consultancySection.appendChild(consultancyGrid);
    addText(consultancySection, 'Consultancy areas / services', consultancy?.consultancy_summary, 'Not submitted');
    addText(consultancySection, 'Typical deliverables', consultancy?.deliverables_summary, 'Not submitted');
    addText(consultancySection, 'Rate notes', consultancy?.rate_notes, 'Not stated');

    const recordsSection = addSection(block, 'Documents & agreements');
    renderDocumentList(recordsSection, documents);
    addRows(
      recordsSection,
      'Accepted agreements',
      agreements,
      row => [humanise(row.agreement_type), row.version ? 'Version ' + row.version : '', row.accepted_at ? 'Accepted ' + fmtDateTime(row.accepted_at) : ''].filter(Boolean).join(' · '),
      'No trainer agreement recorded yet.'
    );

    const complianceSection = addSection(block, 'Privacy & portal records');
    const complianceGrid = make('dl', 'admin-detail-grid');
    addField(complianceGrid, 'Privacy notice version', profile.privacy_notice_version);
    addField(complianceGrid, 'Privacy acknowledged', fmtDateTime(profile.privacy_acknowledged_at));
    addField(complianceGrid, 'Marketing consent', yesNo(profile.marketing_consent));
    addField(complianceGrid, 'Trainer terms version', profile.terms_version);
    addField(complianceGrid, 'Trainer terms accepted', fmtDateTime(profile.terms_accepted_at));
    addField(complianceGrid, 'Approved at', fmtDateTime(profile.approved_at));
    complianceSection.appendChild(complianceGrid);

    const anchor = details.querySelector(':scope > .admin-detail-section') || details.querySelector(':scope > .btn-row');
    details.insertBefore(block, anchor || null);
  }

  function renderAll(context) {
    document.querySelectorAll('#adminTrainerList details[data-trainer-id]').forEach(card => {
      const profile = context.profiles[card.dataset.trainerId];
      if (profile) renderProfileDetail(card, profile, context);
    });
  }

  function showLoadError(message) {
    const holder = $('adminTrainerList');
    if (!holder) return;
    holder.querySelector('[data-admin-profile-detail-error]')?.remove();
    const notice = make('div', 'alert alert-warning');
    notice.dataset.adminProfileDetailError = '1';
    notice.textContent = 'Some detailed trainer records could not be loaded: ' + message;
    holder.prepend(notice);
  }

  async function loadDetails() {
    if (loading) return;
    loading = true;
    observer?.disconnect();
    try {
      if (!admin) {
        const { data, error } = await client.auth.getUser();
        if (error || !data.user || data.user.app_metadata?.role !== 'admin') return;
        admin = data.user;
      }

      const results = await Promise.all([
        client.from('profiles').select('id,email,full_name,phone,state,expertise_summary,linkedin_url,professional_bio,collaboration_status,availability_status,privacy_notice_version,privacy_acknowledged_at,marketing_consent,terms_version,terms_accepted_at,approved_at,created_at,updated_at,public_trainer_profile_url').limit(500),
        client.from('trainer_preferences').select('*').limit(500),
        client.from('trainer_onboarding').select('*').limit(500),
        client.from('trainer_etris_profiles').select('*').limit(500),
        client.from('trainer_consultancy_profiles').select('*').limit(500),
        client.from('trainer_documents').select('id,trainer_id,document_type,provider,file_name,expiry_date,verification_status,created_at,updated_at,programme_id').order('created_at', { ascending: false }).limit(2000),
        client.from('trainer_agreements').select('id,trainer_id,agreement_type,version,accepted_at,created_at').order('accepted_at', { ascending: false }).limit(2000)
      ]);
      const errors = results.map(result => result.error).filter(Boolean);
      if (errors.length) {
        showLoadError(errors.map(error => error.message).join(' · '));
        return;
      }

      const profileRows = results[0].data || [];
      const context = {
        profiles: Object.fromEntries(profileRows.map(row => [row.id, row])),
        preferences: oneByTrainer(results[1].data || []),
        onboarding: oneByTrainer(results[2].data || []),
        etris: oneByTrainer(results[3].data || []),
        consultancy: oneByTrainer(results[4].data || []),
        documents: groupedByTrainer(results[5].data || []),
        agreements: groupedByTrainer(results[6].data || [])
      };
      renderAll(context);
    } catch (error) {
      showLoadError(error.message || 'Unexpected error.');
    } finally {
      loading = false;
      observeTrainerCards();
    }
  }

  function scheduleRefresh() {
    if (loading) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(loadDetails, 260);
  }

  function observeTrainerCards() {
    const holder = $('adminTrainerList');
    if (!holder) return;
    observer?.disconnect();
    observer = new MutationObserver(scheduleRefresh);
    observer.observe(holder, { childList: true, subtree: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    observeTrainerCards();
    setTimeout(loadDetails, 350);
    setTimeout(loadDetails, 1100);
  });
})();
