import { randomUUID } from 'node:crypto';

export function weekStart() {
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'});
 const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);
}
export async function makeWorkspace(db,userId,{demo=false,size=2,name='My team',personName='You'}={}) {
 const id=randomUUID();
 await db.query('insert into rhythm.workspaces(id,name,is_demo) values($1,$2,$3)',[id,demo?'Demo · '+(size===2?'Alex & Sam':size===4?'Community crew':'Import test lab'):name,demo]);
 await db.query('insert into rhythm.memberships values($1,$2,$3)',[id,userId,'owner']);
 const names=demo?(size===4?['Jack','Adam','Lanie','Kevin']:['Alex Rivera','Sam Patel',...(size===6?['Morgan Reed','Jo Bennett','Casey Turner','Taylor Brooks']:[])]):[personName];
 const people=[];
 for (let i=0;i<names.length;i++) {
  const p={id:randomUUID(),name:names[i]};people.push(p);
  await db.query('insert into rhythm.people(id,workspace_id,user_id,name,role,email) values($1,$2,$3,$4,$5,$6)',[p.id,id,i===0?userId:null,p.name,i===0?'owner':i===2?'admin':'member',demo?p.name.split(' ')[0].toLowerCase()+'@example.com':null]);
 }
 if(!demo)return id;
 const signalIds=[randomUUID(),randomUUID()];
 const signalNames=size===4?['Brand content published','Community response time']:['Qualified enquiries','Median response time'],units=size===4?['posts','hours']:['enquiries','hours'];
 const signalOwners=size===4?[people[1],people[2]]:[people[0],people[1]];
 await db.query('insert into rhythm.signals(id,workspace_id,name,unit,owner_id,target,direction) values($1,$2,$3,$4,$5,$6,$7)',[signalIds[0],id,signalNames[0],units[0],signalOwners[0].id,10,'higher']);
 await db.query('insert into rhythm.signals(id,workspace_id,name,unit,owner_id,target,direction) values($1,$2,$3,$4,$5,$6,$7)',[signalIds[1],id,signalNames[1],units[1],signalOwners[1].id,4,'lower']);
 const dates=['2026-09-11','2026-09-18','2026-09-25','2026-10-02'];
 const values=[[8,9,12,10],[5,4,6,3]],scores=[7,8,8,9],meetings=[];
 const actionId=randomUUID();
 for(let i=0;i<4;i++) {
  const mid=randomUUID();meetings.push(mid);
  const rawNotes=i===0?'Requests had no named next owner.':i===1?'Handoff gaps remain. Friday cover needs a decision.':i===2?'Document the handoff in the onboarding guide. Alex agreed to finish it by 2 October.':'Friday cover confirmed. Onboarding guide carried forward, due 5 October.';
  const notes=size===4?rawNotes.replaceAll('Alex','Jack').replaceAll('Sam','Adam'):rawNotes;
  const snapshot={people,signals:[{id:signalIds[0],name:signalNames[0],unit:units[0],owner_id:signalOwners[0].id,target:10,value:values[0][i],direction:'higher'},{id:signalIds[1],name:signalNames[1],unit:units[1],owner_id:signalOwners[1].id,target:4,value:values[1][i],direction:'lower'}],actions:i>=2?[{id:actionId,title:'Finish the onboarding guide',owner_id:people[0].id,due_on:i===2?'2026-10-02':'2026-10-05',status:'open'}]:[],notes};
  await db.query('insert into rhythm.meetings(id,workspace_id,title,started_at,ended_at,notes,snapshot) values($1,$2,$3,$4,$5,$6,$7)',[mid,id,'Weekly Pulse',dates[i]+'T08:00:00Z',dates[i]+'T08:30:00Z',notes,JSON.stringify(snapshot)]);
  for(let p=0;p<2;p++) {
   await db.query('insert into rhythm.signal_results(workspace_id,signal_id,period_date,value,target_snapshot,owner_snapshot,assessment,context) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,signalIds[p],dates[i],values[p][i],p===0?10:4,signalOwners[p].id,p===1?'Watch':'Healthy',p===1&&i===3?'Friday cover is confirmed, but the arrangement needs watching.':'']);
   await db.query('insert into rhythm.ratings values($1,$2,$3,$4)',[id,mid,people[p].id,scores[i]]);
  }
  if(i<3)await db.query('insert into rhythm.issues(workspace_id,meeting_id,title) values($1,$2,$3)',[id,mid,'Unclear handoffs']);
  if(i===1||i===3)await db.query('insert into rhythm.issues(workspace_id,meeting_id,title,status) values($1,$2,$3,$4)',[id,mid,'Friday cover',i===3?'resolved':'open']);
 }
 await db.query('insert into rhythm.actions(id,workspace_id,meeting_id,title,owner_id,due_on,original_due_on,created_at) values($1,$2,$3,$4,$5,$6,$7,$8)',[actionId,id,meetings[2],'Finish the onboarding guide',people[0].id,'2026-10-05','2026-10-02','2026-09-25T08:25:00Z']);
 await db.query('insert into rhythm.action_events(workspace_id,action_id,happened_at,event_type,previous,current,reason,recorded_by) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,actionId,'2026-10-01T10:00:00Z','deadline_changed',JSON.stringify({due_on:'2026-10-02'}),JSON.stringify({due_on:'2026-10-05'}),'Agreed extension recorded by '+names[1]+'. Reason was not recorded.',userId]);
 const priorities=size===4?[['Finish the member onboarding guide','Set next month’s community priorities'],['Publish the brand videos','Review the content results','Prepare next week’s posts'],['Confirm community cover','Welcome new members','Close the handoff gaps'],['Prepare the tech call','Refresh the troubleshooting guide']]:[['Finish the onboarding guide','Review the enquiry journey','Test a clearer welcome message'],['Confirm Friday cover','Check the guide with a new starter','Close the handoff gaps'],['Publish the case study','Review support themes'],['Export referral results','Ask for member testimonials'],['Upload approved testimonial clips'],['Review next week’s schedule']];
 for(let i=0;i<people.length;i++)await db.query('insert into rhythm.preparations(workspace_id,person_id,week_date,priorities,win,blocker) values($1,$2,$3,$4,$5,$6)',[id,people[i].id,weekStart(),JSON.stringify(priorities[i]),i===0?(size===4?'The content target was met.':'Enquiry target met.'):'Made progress on the weekly plan.',i===1?'Who covers Friday when I am away?':'']);
 return id;
}
