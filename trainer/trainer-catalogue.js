(() => {
  const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
  if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||typeof publishedCourses==='undefined')return;

  const originalRender=renderCourses;
  renderCourses=function(){
    originalRender();
    enhanceTrainerCards();
  };

  function esc(v){return String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}

  function enhanceTrainerCards(){
    if(!coursesContainer)return;
    const filtered=getFilteredCourses();
    Array.from(coursesContainer.children).forEach((card,index)=>{
      const course=filtered[index];
      if(!course||!course.trainerName||card.querySelector('.trainer-mini-profile'))return;
      const block=document.createElement('div');
      block.className='trainer-mini-profile';
      block.style.cssText='display:flex;gap:12px;align-items:center;margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px';
      block.innerHTML=`${course.trainerPhoto?`<img src="${esc(course.trainerPhoto)}" alt="${esc(course.trainerName)}" style="width:58px;height:72px;object-fit:cover;border-radius:8px">`:''}<div style="min-width:0"><div style="font-size:12px;color:#6b7280">Trainer</div><strong style="color:#0d3b66">${esc(course.trainerName)}</strong>${course.trainerBio?`<div style="font-size:12px;color:#6b7280;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(course.trainerBio)}</div>`:''}</div>`;
      const enquire=card.querySelector('.inquire-button');
      if(enquire)card.insertBefore(block,enquire);else card.appendChild(block);
    });
  }

  async function loadTrainerProgrammes(){
    try{
      const response=await fetch(`${cfg.supabaseUrl}/rest/v1/public_programme_catalogue?select=*`,{headers:{apikey:cfg.supabasePublishableKey}});
      if(!response.ok)throw new Error(`Supabase catalogue ${response.status}`);
      const rows=await response.json();
      const mapped=(Array.isArray(rows)?rows:[]).map(row=>({
        masterCourseId:`trainer-${row.programme_id}`,
        courseTitle:row.course_title,
        category:row.category,
        duration:row.duration,
        deliveryMode:row.delivery_method,
        publicCourseSummary:row.programme_overview,
        shortCourseOverview:row.programme_overview,
        learningOutcomes:Array.isArray(row.learning_outcomes)?row.learning_outcomes.join('\n'):'',
        courseContent:Array.isArray(row.modules)?row.modules.map(m=>m?.title||m?.name||String(m)).join('\n'):'',
        trainerName:row.trainer_name,
        trainerBio:row.trainer_bio,
        trainerPhoto:row.trainer_photo_url,
        isHRDClaimable:false,
        source:'trainer-portal'
      }));
      const existingKeys=new Set(publishedCourses.map(c=>String(c.masterCourseId||c.courseTitle||'').toLowerCase()));
      mapped.forEach(c=>{const key=String(c.masterCourseId||c.courseTitle||'').toLowerCase();if(!existingKeys.has(key)){publishedCourses.push(c);existingKeys.add(key)}});
      populateCategoryFilter();
      renderCourses();
    }catch(error){
      console.warn('Trainer catalogue could not be loaded',error);
    }
  }

  loadTrainerProgrammes();
})();
