const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const test = require('node:test');

function fixture() {
  const rows = [['Template ID','Nama Templat','Subjek','Isi Emel','Aktif','Poster (pautan Drive)','Kod Khas','Course ID']];
  const files = new Map();
  let locked = false, failWrite = false;
  const sheet = {
    getLastRow: () => rows.length, getMaxColumns: () => 8,
    getRange(r, c, height = 1, width = 1) { return {
      getValues: () => Array.from({length:height}, (_, i) => Array.from({length:width}, (_, j) => rows[r-1+i]?.[c-1+j] ?? '')),
      setValues(values) {
        if (failWrite) throw Error('Sheets unavailable');
        values.forEach((row, i) => row.forEach((v,j) => {
          rows[r-1+i] ||= [];
          rows[r-1+i][c-1+j] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
        }));
      }, setValue() {}, setFontWeight() {}
    }; }
  };
  const blob = (bytes, type, name) => ({ getBytes: () => bytes, getContentType: () => type,
    getName: () => name, setName(n) {name=n; return this;} });
  const ctx = vm.createContext({
    getSession_: e => e.parameter.sessionToken === 'admin' ? {role:'ADMIN'} : e.parameter.sessionToken === 'agent' ? {role:'AGENT'} : null,
    isAdmin_: s => s.role === 'ADMIN', jsonOutput: v => v,
    unauthorized_: () => ({success:false,code:'SESSION_REQUIRED'}), forbidden_: () => ({success:false,code:'FORBIDDEN'}),
    SpreadsheetApp: {flush() {}},
    LockService: {getScriptLock: () => ({tryLock() { assert.equal(locked,false); locked = true; return true; }, releaseLock() {locked = false;}})},
    PropertiesService: {getScriptProperties: () => ({getProperty: () => 'folder',setProperty() {}})},
    DriveApp: {
      getFolderById: () => ({createFile(b) {const id='poster-file-'+files.size; files.set(id,b);return {getUrl: () => 'https://drive.google.com/file/d/'+id+'/view'};}}),
      getFileById: id => ({getMimeType: () => files.get(id).getContentType(),getSize: () => files.get(id).getBytes().length,getBlob: () => files.get(id),getName: () => files.get(id).getName()})
    },
    Utilities: {DigestAlgorithm:{SHA_256:'sha256'}, computeDigest: (a,s) => [...createHash(a).update(s).digest()],
      base64Decode: s => [...Buffer.from(s,'base64')],base64Encode: b => Buffer.from(b).toString('base64'), newBlob:blob,getUuid: () => 'uuid'},
    GmailApp: {sendEmail() {throw Error('Saving must never send email');}}
  });
  vm.runInContext(readFileSync('apps-script/AgentEmail.gs','utf8'),ctx);
  vm.runInContext(readFileSync('apps-script/AgentEmailAdmin.gs','utf8'),ctx);
  ctx.emailSheet_ = () => sheet;
  ctx.driveFileId_ = value => /\/d\/([^/]+)/.exec(value)?.[1] || '';
  const call = (action, payload={}, token='admin') => ctx.routeAgentEmailAdmin_({action,sessionToken:token,...payload});
  const save = (overrides={}) => call('adminEmailSave', {courseId:'HR006',templateId:'PUBLIC-HR006',revision:'',name:'Akta Kerja',subject:'Jemputan',body:'Salam {{nama_pic}}\n\n[[POSTER]]',active:false,...overrides});
  return {ctx,rows,files,call,save,failWrite: () => {failWrite = true;},locked: () => locked};
}
const png = {type:'image/png',base64:Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64')};

test('all editor endpoints reject missing sessions and agents before side effects', () => {
  const f=fixture();
  for (const action of ['adminEmailTemplates','adminEmailPreview','adminEmailSave']) {
    assert.equal(f.call(action,{},'').code,'SESSION_REQUIRED');
    assert.equal(f.call(action,{},'agent').code,'FORBIDDEN');
  }
  assert.equal(f.rows.length,1); assert.equal(f.files.size,0);
});
test('save private poster and draft, reopen, activate for existing agent renderer, then deactivate', () => {
  const f=fixture(), draft=f.save({image:png});
  assert.equal(draft.success,true); assert.equal(f.files.size,1);
  assert.equal(draft.template.courseId,'HR006'); assert.equal(draft.template.active,false);
  assert.equal(f.ctx.emailTemplates_().length,0);
  assert.equal(f.call('adminEmailTemplates').templates[0].body,'Salam {{nama_pic}}\n\n[[POSTER]]');
  assert.equal(f.call('adminEmailPreview',{templateId:draft.template.id}).poster,'data:image/png;base64,'+png.base64);
  const active=f.save({revision:draft.template.revision,active:true});
  assert.equal(active.success,true); assert.equal(f.ctx.emailTemplates_()[0].poster,draft.template.poster);
  assert.equal(f.files.size,1); // Updating text does not re-upload the image.
  assert.equal(f.save({revision:active.template.revision,active:false}).success,true);
  assert.equal(f.ctx.emailTemplates_().length,0); assert.equal(f.locked(),false);
});
test('reject stale edits and conflicting course assignments without uploading', () => {
  const f=fixture(), first=f.save();
  assert.match(f.save({image:png}).message,/telah berubah/);
  assert.equal(f.files.size,0);
  assert.match(f.save({courseId:'HR007',revision:first.template.revision,image:png}).message,/sudah dipautkan/);
  assert.equal(f.files.size,0); assert.equal(f.rows.length,2);
});
test('a programme can hold several templates (e.g. Jemputan and Early Bird)', () => {
  const f=fixture(); f.save();
  const second=f.save({templateId:'PUBLIC-HR006-EARLY',name:'Early Bird',specialCode:'EARLY50'});
  assert.equal(second.success,true); assert.equal(second.template.courseId,'HR006');
  assert.equal(f.call('adminEmailTemplates').templates.filter(t => t.courseId === 'HR006').length,2);
});
test('reject disguised files, oversized bytes, blank active emails and invalid ids', () => {
  const f=fixture();
  for (const image of [{type:'image/png',base64:Buffer.from('<script>x</script>').toString('base64')},
    {...png,type:'image/jpeg'}, {...png,base64:'!bad'},
    {...png,base64:Buffer.alloc(5*1024*1024+1).toString('base64')}]) {
    assert.equal(f.save({image}).success,false);
  }
  assert.equal(f.save({active:true,body:''}).success,false);
  assert.equal(f.save({courseId:'=formula'}).success,false);
  assert.equal(f.save({subject:'Header\nInjected'}).success,false);
  assert.equal(f.files.size,0); assert.equal(f.rows.length,1);
});
test('link a legacy template, retain its poster and protect formula-like text', () => {
  const f=fixture();
  f.rows.push(['AKTA-KERJA-KT','Existing','Old subject','Old body','YA','https://example.com/poster.png','','']);
  const legacy=f.call('adminEmailTemplates').templates[0];
  const result=f.save({templateId:legacy.id,revision:legacy.revision,subject:'=2+2',body:'- bullet\n\n{{kod_diskaun}}'});
  assert.equal(result.success,true); assert.equal(result.template.subject,'=2+2');
  assert.equal(result.template.poster,legacy.poster); assert.equal(result.template.courseId,'HR006');
  assert.equal(f.rows.length,2);
});
test('release lock and preserve private upload if Sheets fails', () => {
  const f=fixture();f.failWrite();
  assert.match(f.save({image:png}).message,/Sheets unavailable/);
  assert.equal(f.locked(),false);assert.equal(f.rows.length,1);
});
test('admin preview renderer matches the sending renderer and escapes user markup', () => {
  const f=fixture();f.ctx.window={};
  vm.runInContext(readFileSync('internal/email-renderer.js','utf8'),f.ctx);
  const data={nama_pic:'<img onerror=bad>',nama_ejen:'Ejen',telefon_ejen:'0123456789',kod_diskaun:'EASY'};
  const text=f.ctx.fillTemplate_('Salam {{nama_pic}}\n\n[[POSTER]]\n\n**Test**',data);
  const args=[text,data,{logo:'',poster:'cid:poster',badges:[]},{title:'Advisor',address:'Office',officePhone:'123',sender:'sales@example.com'}];
  assert.equal(f.ctx.window.EasyLatihEmailRenderer.layout(...args),f.ctx.emailLayout_(...args));
  assert.match(f.ctx.emailLayout_(...args),/&lt;img onerror=bad&gt;/);
});
