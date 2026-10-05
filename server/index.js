import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { randomBytes,createHash } from 'node:crypto';
import path from 'node:path';
import { makeWorkspace,weekStart } from './seed.js';
import { mountAI, settingsSummary } from './ai.js';

const { Pool }=pg;
pg.types.setTypeParser(1082,value=>value);
export const pool=new Pool({connectionString:process.env.DATABASE_URL,max:8});
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const authClient=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,options);
const app=express();app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:'],connectSrc:["'self'"],fontSrc:["'self'"],frameAncestors:["'none'"]}}}));
app.use(express.json({limit:'15mb'}));app.use(cookieParser());
app.use('/api',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false}));
app.use('/api',(req,res,next)=>{
 if(['POST','PATCH','DELETE'].includes(req.method)&&req.headers.origin&&req.headers.origin!==process.env.APP_URL&&!req.headers.origin.startsWith('http://127.0.0.1:'))return res.status(403).json({error:'This request came from a different site.'});
 next();
});
const authLimit=rateLimit({windowMs:3600000,limit:60,standardHeaders:'draft-8',legacyHeaders:false});
const uuid=z.string().uuid();const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const secure=process.env.NODE_ENV==='production';
function sessions(res,session){
 res.cookie('rhythm_session',session.access_token,{httpOnly:true,secure,sameSite:'lax',maxAge:86400000,path:'/'});
 res.cookie('rhythm_refresh',session.refresh_token,{httpOnly:true,secure,sameSite:'lax',maxAge:7*86400000,path:'/'});
}
function workspaceCookie(res,id){res.cookie('rhythm_workspace',id,{httpOnly:true,secure,sameSite:'lax',maxAge:7*86400000,path:'/'});}
export async function transaction(fn){const db=await pool.connect();try{await db.query('begin');const result=await fn(db);await db.query('commit');return result;}catch(e){await db.query('rollback');throw e;}finally{db.release();}}
export function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
export async function personInWorkspace(id,w,db=pool){if(!id)return;const r=await db.query('select id from rhythm.people where id=$1 and workspace_id=$2 and active',[id,w]);if(!r.rowCount)fail('Choose an active person in this workspace.');}
const visibleMeeting=(user)=>`(m.private_people is null or exists(select 1 from rhythm.people p where p.id=any(m.private_people) and p.user_id='${user}'::uuid))`;
export async function dataFor(req,db=pool){
 const w=req.workspace.id;const user=req.user.id;
 const [people,signals,results,preparations,meetings,actions,events,ratings,issues,sources,members]=await Promise.all([
  db.query('select * from rhythm.people where workspace_id=$1 order by name',[w]),
  db.query('select * from rhythm.signals where workspace_id=$1 and active order by name',[w]),
  db.query('select * from rhythm.signal_results where workspace_id=$1 order by period_date',[w]),
  db.query('select * from rhythm.preparations where workspace_id=$1 and week_date=$2',[w,weekStart()]),
  db.query(`select m.* from rhythm.meetings m where m.workspace_id=$1 and ${visibleMeeting(user)} order by started_at desc`,[w]),
  db.query(`select a.* from rhythm.actions a left join rhythm.meetings m on m.id=a.meeting_id where a.workspace_id=$1 and (a.meeting_id is null or ${visibleMeeting(user)}) order by a.status,a.due_on nulls last`,[w]),
  db.query(`select e.* from rhythm.action_events e join rhythm.actions a on a.id=e.action_id left join rhythm.meetings m on m.id=a.meeting_id where e.workspace_id=$1 and (a.meeting_id is null or ${visibleMeeting(user)}) order by happened_at`,[w]),
  db.query(`select r.* from rhythm.ratings r join rhythm.meetings m on m.id=r.meeting_id where r.workspace_id=$1 and ${visibleMeeting(user)}`,[w]),
  db.query(`select i.* from rhythm.issues i left join rhythm.meetings m on m.id=i.meeting_id where i.workspace_id=$1 and (i.meeting_id is null or ${visibleMeeting(user)})`,[w]),
  db.query('select id,title,source_date,timezone,imported_at,created_at from rhythm.sources where workspace_id=$1 order by created_at desc',[w]),
  db.query('select user_id,role from rhythm.memberships where workspace_id=$1',[w])
 ]);
 return {workspace:req.workspace,user:{id:user,email:req.user.email},role:req.role,week:weekStart(),people:people.rows,signals:signals.rows,results:results.rows,preparations:preparations.rows,meetings:meetings.rows,actions:actions.rows,events:events.rows,ratings:ratings.rows,issues:issues.rows,sources:sources.rows,members:members.rows,settings:await settingsSummary(w,db)};
}
async function requireAuth(req,res,next){
 let token=req.cookies.rhythm_session;if(!token)return res.status(401).json({error:'Please sign in or start a demo.'});
 let result=await authClient().auth.getUser(token);
 if(result.error&&req.cookies.rhythm_refresh){const r=await authClient().auth.refreshSession({refresh_token:req.cookies.rhythm_refresh});if(r.data.session){sessions(res,r.data.session);result={data:{user:r.data.user}};}}
 if(result.error||!result.data.user)return res.status(401).json({error:'Your session ended. Please sign in again.'});
 req.user=result.data.user;next();
}
async function requireWorkspace(req,res,next){
 const id=req.cookies.rhythm_workspace;if(!uuid.safeParse(id).success)return res.status(400).json({error:'Choose a workspace.'});
 const r=await pool.query('select w.*,m.role from rhythm.workspaces w join rhythm.memberships m on m.workspace_id=w.id where w.id=$1 and m.user_id=$2',[id,req.user.id]);
 if(!r.rowCount)return res.status(403).json({error:'You do not have access to this workspace.'});req.workspace=r.rows[0];req.role=r.rows[0].role;next();
}
app.get('/api/health',async(req,res)=>{await pool.query('select 1');res.json({ok:true,product:'Team Rhythm'});});
app.post('/api/auth/demo',authLimit,async(req,res)=>{
 const size=[2,4,6].includes(req.body.size)?req.body.size:4;const {data,error}=await authClient().auth.signInAnonymously();if(error)fail('Could not start the demo. Please try again.',503);
 const id=await transaction(db=>makeWorkspace(db,data.user.id,{demo:true,size}));sessions(res,data.session);workspaceCookie(res,id);res.json({ok:true});
});
app.post('/api/auth/login',authLimit,async(req,res)=>{
 const b=z.object({email:z.email(),password:z.string().min(8),invite:z.string().min(32).max(128).optional()}).parse(req.body);
 const {data,error}=await authClient().auth.signInWithPassword({email:b.email,password:b.password});if(error)fail('Email or password was not recognised.',401);
 if(b.invite){
  const id=await transaction(async db=>{
   const hash=createHash('sha256').update(b.invite).digest('hex');
   const r=await db.query('select * from rhythm.invites where token_hash=$1 and expires_at>now() and accepted_at is null for update',[hash]);
   if(!r.rowCount)fail('This invitation has expired or has already been used.');const i=r.rows[0];
   if(i.email.toLowerCase()!==data.user.email.toLowerCase())fail('Sign in with the invited email address.');
   // An invitation adds membership; it never overwrites an existing member's role.
   await db.query('insert into rhythm.memberships(workspace_id,user_id,role) values($1,$2,$3) on conflict do nothing',[i.workspace_id,data.user.id,i.role]);
   await db.query('insert into rhythm.people(workspace_id,user_id,name,email,role) select $1,$2,$3,$4,$5 where not exists(select 1 from rhythm.people where workspace_id=$1 and user_id=$2)',[i.workspace_id,data.user.id,i.name,data.user.email,i.role]);
   await db.query('update rhythm.invites set accepted_at=now() where token_hash=$1',[hash]);return i.workspace_id;
  });sessions(res,data.session);workspaceCookie(res,id);return res.json({ok:true});
 }
 const ws=await pool.query('select workspace_id from rhythm.memberships where user_id=$1 order by workspace_id limit 1',[data.user.id]);
 if(!ws.rowCount)fail('No workspace is linked to this account. Create one or use an invitation.');sessions(res,data.session);workspaceCookie(res,ws.rows[0].workspace_id);res.json({ok:true});
});
app.post('/api/auth/signup',authLimit,async(req,res)=>{
 const b=z.object({email:z.email(),password:z.string().min(10),name:z.string().min(1).max(80),team:z.string().min(1).max(80),invite:z.string().optional()}).parse(req.body);
 if(b.invite){const r=await pool.query('select email from rhythm.invites where token_hash=$1 and expires_at>now() and accepted_at is null',[createHash('sha256').update(b.invite).digest('hex')]);if(!r.rowCount)fail('This invitation has expired or has already been used.');if(r.rows[0].email.toLowerCase()!==b.email.toLowerCase())fail('Use the invited email address.');}
 const {data,error}=await authClient().auth.signUp({email:b.email,password:b.password});if(error||!data.session)fail('Could not create an account. Try signing in if it already exists.');
 let id;
 await transaction(async db=>{
  if(b.invite){const hash=createHash('sha256').update(b.invite).digest('hex');const r=await db.query('select * from rhythm.invites where token_hash=$1 and expires_at>now() and accepted_at is null for update',[hash]);if(!r.rowCount)fail('This invitation has expired or has already been used.');const i=r.rows[0];if(i.email.toLowerCase()!==b.email.toLowerCase())fail('Use the invited email address.');id=i.workspace_id;await db.query('insert into rhythm.memberships values($1,$2,$3)',[id,data.user.id,i.role]);await db.query('insert into rhythm.people(workspace_id,user_id,name,email,role) values($1,$2,$3,$4,$5)',[id,data.user.id,b.name,b.email,i.role]);await db.query('update rhythm.invites set accepted_at=now() where token_hash=$1',[hash]);}
  else {id=await makeWorkspace(db,data.user.id,{name:b.team,personName:b.name});await db.query('update rhythm.people set email=$1 where workspace_id=$2 and user_id=$3',[b.email,id,data.user.id]);}
 });sessions(res,data.session);workspaceCookie(res,id);res.json({ok:true});
});
app.post('/api/auth/logout',(req,res)=>{for(const name of ['rhythm_session','rhythm_refresh','rhythm_workspace'])res.clearCookie(name,{path:'/'});res.json({ok:true});});
app.use('/api',requireAuth,requireWorkspace);
app.get('/api/state',async(req,res)=>res.json(await dataFor(req)));
app.post('/api/demo/reset',async(req,res)=>{
 if(!req.workspace.is_demo)fail('Reset is only available for fictional demos.');
 const size=(await pool.query('select count(*)::int as n from rhythm.people where workspace_id=$1',[req.workspace.id])).rows[0].n;
 const id=await transaction(async db=>{await db.query('delete from rhythm.workspaces where id=$1',[req.workspace.id]);return makeWorkspace(db,req.user.id,{demo:true,size:size>=6?6:size>=4?4:2});});workspaceCookie(res,id);res.json({ok:true});
});
app.post('/api/preparation',async(req,res)=>{
 const b=z.object({person_id:uuid,priorities:z.array(z.string().max(200)).max(3),win:z.string().max(1000),blocker:z.string().max(1000)}).parse(req.body);await personInWorkspace(b.person_id,req.workspace.id);
 if(!req.workspace.is_demo&&!['owner','admin'].includes(req.role)){const own=await pool.query('select id from rhythm.people where id=$1 and user_id=$2',[b.person_id,req.user.id]);if(!own.rowCount)fail('You can only submit your own preparation.',403);}
 await pool.query('insert into rhythm.preparations(workspace_id,person_id,week_date,priorities,win,blocker) values($1,$2,$3,$4,$5,$6) on conflict(workspace_id,person_id,week_date) do update set priorities=excluded.priorities,win=excluded.win,blocker=excluded.blocker,updated_at=now()',[req.workspace.id,b.person_id,weekStart(),JSON.stringify(b.priorities),b.win,b.blocker]);res.json({ok:true});
});
app.post('/api/signals',async(req,res)=>{
 if(!['owner','admin'].includes(req.role))fail('An owner or admin can define Signals.',403);
 const b=z.object({name:z.string().min(1).max(100),unit:z.string().min(1).max(40),owner_id:uuid,target:z.number().finite(),direction:z.enum(['higher','lower'])}).parse(req.body);await personInWorkspace(b.owner_id,req.workspace.id);
 const r=await pool.query('insert into rhythm.signals(workspace_id,name,unit,owner_id,target,direction) values($1,$2,$3,$4,$5,$6) returning *',[req.workspace.id,b.name,b.unit,b.owner_id,b.target,b.direction]);res.json(r.rows[0]);
});
app.post('/api/signals/:id/result',async(req,res)=>{
 uuid.parse(req.params.id);const b=z.object({value:z.number().finite(),assessment:z.enum(['Healthy','Watch','Needs help']),context:z.string().max(1000)}).parse(req.body);
 const r=await pool.query('select * from rhythm.signals where id=$1 and workspace_id=$2',[req.params.id,req.workspace.id]);if(!r.rowCount)fail('Signal not found.',404);const s=r.rows[0];
 if(!req.workspace.is_demo&&!['owner','admin'].includes(req.role)){const own=await pool.query('select id from rhythm.people where id=$1 and user_id=$2',[s.owner_id,req.user.id]);if(!own.rowCount)fail('Only the owner can record this Signal.',403);}
 await pool.query('insert into rhythm.signal_results(workspace_id,signal_id,period_date,value,target_snapshot,owner_snapshot,assessment,context) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(signal_id,period_date) do update set value=excluded.value,assessment=excluded.assessment,context=excluded.context',[req.workspace.id,s.id,new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'}),b.value,s.target,s.owner_id,b.assessment,b.context]);res.json({ok:true});
});
app.post('/api/actions',async(req,res)=>{
 const b=z.object({title:z.string().min(1).max(300),owner_id:uuid,due_on:date,kind:z.enum(['action','milestone']).default('action'),meeting_id:uuid.optional()}).parse(req.body);await personInWorkspace(b.owner_id,req.workspace.id);
 if(b.meeting_id){const m=await pool.query(`select m.id from rhythm.meetings m where m.id=$1 and m.workspace_id=$2 and ${visibleMeeting(req.user.id)}`,[b.meeting_id,req.workspace.id]);if(!m.rowCount)fail('Meeting not found.',404);}
 const r=await pool.query('insert into rhythm.actions(workspace_id,title,owner_id,due_on,original_due_on,kind,meeting_id) values($1,$2,$3,$4,$4,$5,$6) returning *',[req.workspace.id,b.title,b.owner_id,b.due_on,b.kind,b.meeting_id||null]);res.json(r.rows[0]);
});
app.patch('/api/actions/:id',async(req,res)=>{
 uuid.parse(req.params.id);const b=z.object({status:z.enum(['open','done']).optional(),due_on:date.optional(),owner_id:uuid.optional(),reason:z.string().max(1000).optional()}).parse(req.body);
 if(!b.status&&!b.due_on&&!b.owner_id)fail('Choose a change to save.');if(b.owner_id)await personInWorkspace(b.owner_id,req.workspace.id);
 await transaction(async db=>{const r=await db.query(`select a.* from rhythm.actions a left join rhythm.meetings m on m.id=a.meeting_id where a.id=$1 and a.workspace_id=$2 and (a.meeting_id is null or ${visibleMeeting(req.user.id)}) for update of a`,[req.params.id,req.workspace.id]);if(!r.rowCount)fail('Action not found.',404);const a=r.rows[0];
  const next={status:b.status||a.status,due_on:b.due_on||a.due_on,owner_id:b.owner_id||a.owner_id};if(b.due_on&&b.due_on!==String(a.due_on).slice(0,10)&&!b.reason)fail('Add a reason for changing the deadline.');
  await db.query('update rhythm.actions set status=$1,due_on=$2,owner_id=$3,completed_at=case when $1=\'done\' then coalesce(completed_at,now()) else null end where id=$4',[next.status,next.due_on,next.owner_id,a.id]);
  await db.query('insert into rhythm.action_events(workspace_id,action_id,event_type,previous,current,reason,recorded_by) values($1,$2,$3,$4,$5,$6,$7)',[req.workspace.id,a.id,b.due_on?'deadline_changed':b.owner_id?'owner_changed':'status_changed',JSON.stringify({status:a.status,due_on:a.due_on,owner_id:a.owner_id}),JSON.stringify(next),b.reason||null,req.user.id]);
 });res.json({ok:true});
});
app.post('/api/meetings',async(req,res)=>{
 const b=z.object({type:z.enum(['weekly','leadership','one_to_one','quarterly','annual']),private_people:z.array(uuid).min(2).max(2).optional()}).parse(req.body);
 if(b.type==='one_to_one'){
  if(!b.private_people)fail('Choose the two participants.');for(const id of b.private_people)await personInWorkspace(id,req.workspace.id);
  const own=await pool.query('select id from rhythm.people where id=any($1::uuid[]) and user_id=$2',[b.private_people,req.user.id]);if(!req.workspace.is_demo&&!own.rowCount)fail('A private one-to-one must include you.',403);
 }
 const titles={weekly:'Weekly Pulse',leadership:'Leadership Pulse',one_to_one:'One-to-one',quarterly:'Quarterly Reset',annual:'Annual Direction'};
 const r=await pool.query('insert into rhythm.meetings(workspace_id,title,type,private_people) values($1,$2,$3,$4) returning *',[req.workspace.id,titles[b.type],b.type,b.type==='one_to_one'?b.private_people:null]);res.json(r.rows[0]);
});
app.patch('/api/meetings/:id',async(req,res)=>{
 uuid.parse(req.params.id);const b=z.object({notes:z.string().max(20000).optional(),agenda_index:z.number().int().min(0).max(10).optional()}).parse(req.body);
 const r=await pool.query(`update rhythm.meetings m set notes=coalesce($1,notes),agenda_index=coalesce($2,agenda_index) where m.id=$3 and m.workspace_id=$4 and m.ended_at is null and ${visibleMeeting(req.user.id)} returning id`,[b.notes??null,b.agenda_index??null,req.params.id,req.workspace.id]);if(!r.rowCount)fail('This meeting is not available for editing.',404);res.json({ok:true});
});
app.post('/api/meetings/:id/finish',async(req,res)=>{
 uuid.parse(req.params.id);const b=z.object({notes:z.string().max(20000),ratings:z.array(z.object({person_id:uuid,score:z.number().int().min(1).max(10)})).max(30)}).parse(req.body);
 await transaction(async db=>{const r=await db.query(`select m.* from rhythm.meetings m where m.id=$1 and m.workspace_id=$2 and ${visibleMeeting(req.user.id)} for update`,[req.params.id,req.workspace.id]);if(!r.rowCount)fail('Meeting not found.',404);if(r.rows[0].ended_at)return;
  for(const rating of b.ratings){await personInWorkspace(rating.person_id,req.workspace.id,db);if(!req.workspace.is_demo){const own=await db.query('select id from rhythm.people where id=$1 and user_id=$2',[rating.person_id,req.user.id]);if(!own.rowCount)fail('Only submit your own meeting rating.',403);}await db.query('insert into rhythm.ratings values($1,$2,$3,$4) on conflict(meeting_id,person_id) do nothing',[req.workspace.id,req.params.id,rating.person_id,rating.score]);}
 const state=await dataFor(req,db);const snapshot={people:state.people,signals:state.signals.map(s=>({...s,...state.results.filter(r=>r.signal_id===s.id).at(-1)})),actions:state.actions.filter(a=>(a.meeting_id===req.params.id||a.status==='open')&&(r.rows[0].private_people||!state.meetings.find(m=>m.id===a.meeting_id)?.private_people)),notes:b.notes};
  await db.query('update rhythm.meetings set ended_at=now(),notes=$1,snapshot=$2 where id=$3',[b.notes,JSON.stringify(snapshot),req.params.id]);
 });res.json({ok:true});
});
app.post('/api/meetings/:id/rating',async(req,res)=>{
 uuid.parse(req.params.id);const b=z.object({score:z.number().int().min(1).max(10)}).strict().parse(req.body);
 const meeting=await pool.query(`select m.id from rhythm.meetings m where m.id=$1 and m.workspace_id=$2 and ${visibleMeeting(req.user.id)}`,[req.params.id,req.workspace.id]);if(!meeting.rowCount)fail('Meeting not found.',404);
 const own=await pool.query('select id from rhythm.people where workspace_id=$1 and user_id=$2 and active',[req.workspace.id,req.user.id]);if(!own.rowCount)fail('Your participant record is unavailable.',403);
 await pool.query('insert into rhythm.ratings(workspace_id,meeting_id,person_id,score) values($1,$2,$3,$4) on conflict(meeting_id,person_id) do update set score=excluded.score',[req.workspace.id,req.params.id,own.rows[0].id,b.score]);res.json({ok:true});
});
app.post('/api/issues',async(req,res)=>{const b=z.object({title:z.string().min(1).max(300),meeting_id:uuid.optional()}).parse(req.body);if(b.meeting_id){const m=await pool.query(`select m.id from rhythm.meetings m where m.id=$1 and m.workspace_id=$2 and ${visibleMeeting(req.user.id)}`,[b.meeting_id,req.workspace.id]);if(!m.rowCount)fail('Meeting not found.',404);}await pool.query('insert into rhythm.issues(workspace_id,title,meeting_id) values($1,$2,$3)',[req.workspace.id,b.title,b.meeting_id||null]);res.json({ok:true});});
app.post('/api/team/invite',async(req,res)=>{
 if(!['owner','admin'].includes(req.role))fail('An owner or admin can invite members.',403);if(req.workspace.is_demo)fail('Invitations are for real workspaces. Use the fictional people in this demo.');
 const b=z.object({name:z.string().min(1).max(80),email:z.email(),role:z.enum(['admin','member']).default('member')}).parse(req.body);const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');await pool.query('insert into rhythm.invites(token_hash,workspace_id,name,email,expires_at,accepted_at,role) values($1,$2,$3,$4,now()+interval \'7 days\',null,$5)',[hash,req.workspace.id,b.name,b.email,b.role]);res.json({url:process.env.APP_URL+'/?invite='+token,email:b.email});
});
app.patch('/api/team/:id',async(req,res)=>{
 if(!['owner','admin'].includes(req.role))fail('An owner or admin can manage members.',403);uuid.parse(req.params.id);const b=z.object({active:z.boolean().optional(),name:z.string().min(1).max(80).optional(),email:z.email().optional(),role:z.enum(['admin','member']).optional()}).parse(req.body);
 await transaction(async db=>{const r=await db.query('select * from rhythm.people where id=$1 and workspace_id=$2 for update',[req.params.id,req.workspace.id]);if(!r.rowCount)fail('Person not found.',404);const p=r.rows[0];if(p.role==='owner'&&(b.role||b.active===false))fail('The workspace owner’s access cannot be changed here.');if(p.user_id===req.user.id&&b.active===false)fail('You cannot deactivate your own account.');
  await db.query('update rhythm.people set active=coalesce($1,active),name=coalesce($2,name),email=coalesce($3,email),role=coalesce($4,role) where id=$5',[b.active??null,b.name||null,b.email||null,b.role||null,p.id]);
  if(p.user_id){if(b.active===false)await db.query('delete from rhythm.memberships where workspace_id=$1 and user_id=$2',[req.workspace.id,p.user_id]);else if(b.role||b.active===true)await db.query('insert into rhythm.memberships values($1,$2,$3) on conflict(workspace_id,user_id) do update set role=excluded.role',[req.workspace.id,p.user_id,b.role||p.role]);}
 });res.json({ok:true});
});
mountAI(app,{pool,transaction,fail,personInWorkspace,dataFor});
app.use('/api',(req,res)=>res.status(404).json({error:'API route not found.'}));
app.use('/media',express.static(path.resolve('media')));app.use('/media',(req,res)=>res.status(404).end());
app.use(express.static(path.resolve('dist')));app.get('/{*path}',(req,res)=>res.sendFile(path.resolve('dist/index.html')));
app.use((err,req,res,next)=>{const validation=err instanceof z.ZodError;res.status(validation?400:err.status||500).json({error:validation?err.issues.map(i=>i.message).join('; '):err.status?err.message:'The request could not be completed. Please try again.'});if(!validation&&!err.status)console.error('Request failure:',err.code||err.name);});
const schema=await readFile(new URL('./schema.sql',import.meta.url),'utf8');await pool.query(schema);
app.listen(process.env.PORT||3000,()=>console.log('Team Rhythm API and web app ready.'));
