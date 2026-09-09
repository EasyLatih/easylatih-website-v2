(() => {
  const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
  if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||typeof publishedCourses==='undefined')return;

  function norm(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ')}

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
        isHRDClaimable:false,
        source:'trainer-portal'
      }));
      const existingIds=new Set(publishedCourses.map(c=>norm(c.masterCourseId)).filter(Boolean));
      const existingTitles=new Set(publishedCourses.map(c=>norm(c.courseTitle)).filter(Boolean));
      mapped.forEach(c=>{
        const id=norm(c.masterCourseId),title=norm(c.courseTitle);
        if((id&&existingIds.has(id))||(title&&existingTitles.has(title)))return;
        publishedCourses.push(c);
        if(id)existingIds.add(id);
        if(title)existingTitles.add(title);
      });
      populateCategoryFilter();
      renderCourses();
    }catch(error){
      console.warn('Trainer catalogue could not be loaded',error);
    }
  }

  loadTrainerProgrammes();
})();
