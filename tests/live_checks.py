"""Exercise the deployed app with fictional, isolated workspaces; no production data."""
import base64, http.cookiejar, json, secrets, urllib.request, urllib.error, sys, os
from pathlib import Path
BASE=os.environ.get('TEAM_RHYTHM_TEST_URL','http://127.0.0.1:3000').rstrip('/')
ROOT=Path(__file__).resolve().parents[1];checks=[]
(ROOT/'output/verification').mkdir(parents=True,exist_ok=True)
def check(condition,label):
    if not condition:raise AssertionError(label)
    checks.append(label);print('PASS',label,flush=True)
class Client:
    def __init__(self):
        self.jar=http.cookiejar.CookieJar();self.http=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def call(self,path,body=None,method=None,origin=BASE):
        request=urllib.request.Request(BASE+'/api/'+path,data=json.dumps(body).encode() if body is not None else None,method=method or ('POST' if body is not None else 'GET'),headers={'Content-Type':'application/json','Origin':origin})
        try:
            r=self.http.open(request,timeout=110);return r.status,json.load(r)
        except urllib.error.HTTPError as e:return e.code,json.load(e)
    def ok(self,path,body=None,method=None):
        status,result=self.call(path,body,method)
        if status!=200:raise AssertionError(path+': '+str(status)+' '+str(result))
        return result
def main():
    outsider=Client();check(outsider.call('state')[0]==401,'Unauthenticated data access is denied')
    a,b=Client(),Client();a.ok('auth/demo',{'size':6});b.ok('auth/demo',{'size':2});s=a.ok('state');sb=b.ok('state')
    check(len(s['people'])==6 and len(sb['people'])==2,'Both six-person and two-person demos load')
    check(s['workspace']['id']!=sb['workspace']['id'] and not set(p['id'] for p in s['people'])&set(p['id'] for p in sb['people']),'Demos have separate workspaces and people')
    check(b.call('actions/'+s['actions'][0]['id'],{'status':'done'},'PATCH')[0]==404,'Cross-tenant commitment edits are denied')
    check(b.call('preparation',{'person_id':s['people'][0]['id'],'priorities':['foreign'],'win':'','blocker':''})[0]==400,'Cross-tenant person references are denied')
    check(a.call('issues',{'title':'CSRF attempt'},origin='https://example.com')[0]==403,'Cross-origin writes are denied')
    person=next(p for p in s['people'] if p['name'].startswith('Alex'))
    a.ok('preparation',{'person_id':person['id'],'priorities':['Integration test priority'],'win':'Saved win','blocker':'Test hurdle'})
    check(any(p['win']=='Saved win' for p in a.ok('state')['preparations']),'Preparation persists through a fresh request')
    signal=a.ok('signals',{'name':'Test videos published','unit':'videos','owner_id':person['id'],'target':3,'direction':'higher'})
    a.ok('signals/'+signal['id']+'/result',{'value':2,'assessment':'Watch','context':'One approval pending.'})
    check(any(r['signal_id']==signal['id'] and float(r['value'])==2 for r in a.ok('state')['results']),'Custom units and Signal results persist')
    action=a.ok('actions',{'title':'Integration test commitment','owner_id':person['id'],'due_on':'2026-10-08','kind':'milestone'})
    check(a.call('actions/'+action['id'],{'due_on':'2026-10-09'},'PATCH')[0]==400,'A deadline amendment requires a reason')
    a.ok('actions/'+action['id'],{'due_on':'2026-10-09','reason':'Confirmed test extension.'},'PATCH')
    sa=a.ok('state');changed=next(x for x in sa['actions'] if x['id']==action['id'])
    check(changed['original_due_on']=='2026-10-08' and changed['due_on']=='2026-10-09' and any(e['action_id']==action['id'] and e['reason']=='Confirmed test extension.' for e in sa['events']),'Original date and amendment evidence are retained')
    meeting=a.ok('meetings',{'type':'weekly'});a.ok('meetings/'+meeting['id'],{'notes':'Recorded test decision.','agenda_index':4},'PATCH')
    finish={'notes':'Recorded test decision.','ratings':[{'person_id':person['id'],'score':9}]};a.ok('meetings/'+meeting['id']+'/finish',finish);a.ok('meetings/'+meeting['id']+'/finish',finish)
    sa=a.ok('state');m=next(m for m in sa['meetings'] if m['id']==meeting['id'])
    check(m['ended_at'] and m['snapshot']['notes']=='Recorded test decision.' and sum(r['meeting_id']==m['id'] for r in sa['ratings'])==1,'Closing a meeting saves a snapshot and is idempotent')
    check(any(x['id']==action['id'] for x in m['snapshot']['actions']),'Open commitments carry into the closing snapshot')
    a.ok('actions/'+action['id'],{'status':'done'},'PATCH');m2=next(x for x in a.ok('state')['meetings'] if x['id']==meeting['id'])
    check(next(x for x in m2['snapshot']['actions'] if x['id']==action['id'])['status']=='open','Historical action snapshots keep their closing state')
    query=b.ok('ask',{'question':'Who owns the onboarding guide, and when is it due?'})
    check(query['citations'] and '5' in query['answer'] and 'Alex' in query['answer'],'Live OpenRouter answer names the owner and current deadline with citations')
    fuzzy=b.ok('ask',{'question':'Why was the onboarding guide deadline extended?'})
    check(any(word in (fuzzy['answer']+' '+fuzzy['caveat']).lower() for word in ['not recorded','unknown','not documented','no reason','not specified']),'AI acknowledges a missing reason instead of inventing one')
    if '--skip-ai-import' not in sys.argv:
        run_imports(a)
    # Real-account privacy checks use reserved example.com addresses and fictional records.
    run_accounts(a,b,s)
    report={'tested_at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'url':BASE,'passed':checks,'count':len(checks),'status':'passed','ai_imports_tested':'--skip-ai-import' not in sys.argv}
    (ROOT/'output/verification').mkdir(parents=True,exist_ok=True);(ROOT/'output/verification/live-checks.json').write_text(json.dumps(report,indent=2))
    print('ALL',len(checks),'CHECKS PASSED',flush=True)
def run_imports(a):
    fixtures=a.ok('fixtures');messy=fixtures[1]
    review=a.ok('import/review',{'title':messy['title'],'text':messy['text'],'source_date':messy['source_date'],'timezone':messy['timezone']})
    check(len(review['tasks'])==7 and sum(not t['needs_clarification'] for t in review['tasks'])==5,'Live messy transcript yields seven tasks, five ready and two requiring clarification')
    ready=[{'index':i,'owner_id':t['owner_id'],'due_on':t['due_on'],'kind':'milestone','clarification':''} for i,t in enumerate(review['tasks']) if not t['needs_clarification']]
    saved=a.ok('import/save',{'source_id':review['id'],'tasks':ready});retry=a.ok('import/save',{'source_id':review['id'],'tasks':ready})
    check(saved['saved']==5 and retry['already_saved'],'Reviewed import saves selected commitments without duplicating on retry')
    email=fixtures[2];rev=a.ok('import/review',{'title':email['title'],'text':email['text'],'source_date':None,'timezone':email['timezone']})
    check(len(rev['tasks'])==1 and rev['tasks'][0]['due_on']=='2026-10-13' and rev['tasks'][0]['original_due_on']=='2026-10-16','Email review keeps the original deadline and the accepted earlier date')
    pdf=base64.b64encode((ROOT/'output/pdf/sample-email-chains.pdf').read_bytes()).decode()
    rp=a.ok('import/review',{'title':'Two fictional email chains PDF','pdf':pdf,'source_date':None,'timezone':'Europe/London'})
    check(len(rp['tasks'])==2 and set(t['due_on'] for t in rp['tasks'])=={'2026-10-13','2026-10-22'},'Live PDF import reads both email chains and resolves both amendments')
def run_accounts(a,b,s):
    suffix=secrets.token_hex(5);owner,member,third=Client(),Client(),Client();password=secrets.token_urlsafe(20)
    owner.ok('auth/signup',{'name':'Test owner','team':'Privacy verification '+suffix,'email':suffix+'-owner@example.com','password':password});so=owner.ok('state')
    for client,name in [(member,'member'),(third,'third')]:
        email=suffix+'-'+name+'@example.com';inv=owner.ok('team/invite',{'name':'Test '+name,'email':email});token=inv['url'].split('invite=')[1]
        client.ok('auth/signup',{'name':'Test '+name,'team':'Invited','email':email,'password':password,'invite':token})
    so=owner.ok('state');po=next(p for p in so['people'] if p['user_id']==so['user']['id']);sm=member.ok('state');pm=next(p for p in sm['people'] if p['user_id']==sm['user']['id'])
    private=owner.ok('meetings',{'type':'one_to_one','private_people':[po['id'],pm['id']]});owner.ok('meetings/'+private['id'],{'notes':'Private fictional support conversation.'},'PATCH')
    pa=owner.ok('actions',{'title':'Private fictional action','owner_id':pm['id'],'due_on':'2026-10-10','meeting_id':private['id']})
    check(any(m['id']==private['id'] for m in member.ok('state')['meetings']),'Both one-to-one participants can read their meeting')
    st=third.ok('state');check(not any(m['id']==private['id'] for m in st['meetings']) and not any(x['id']==pa['id'] for x in st['actions']),'A third team member cannot read private meetings or linked actions')
    check(third.call('meetings/'+private['id'],{'notes':'forbidden'},'PATCH')[0]==404 and third.call('actions/'+pa['id'],{'status':'done'},'PATCH')[0]==404,'Private meeting and action edits are denied to non-participants')
    public=owner.ok('meetings',{'type':'weekly'});owner.ok('meetings/'+public['id']+'/finish',{'notes':'Shared team notes.','ratings':[]});st=third.ok('state');snap=next(m for m in st['meetings'] if m['id']==public['id'])['snapshot']
    check(not any(a['id']==pa['id'] for a in snap['actions']),'A public closing snapshot excludes private one-to-one commitments')
    check(member.call('settings',{'model':'google/gemini-2.5-flash'})[0]==403,'A member cannot change owner-only AI settings')
    check(member.call('preparation',{'person_id':po['id'],'priorities':['forbidden'],'win':'','blocker':''})[0]==403,'Person selection does not grant another member’s preparation permissions')
    admin,new_member=Client(),Client();email=suffix+'-admin@example.com';inv=owner.ok('team/invite',{'name':'Test admin','email':email,'role':'admin'})
    admin.ok('auth/signup',{'name':'Test admin','team':'Invited','email':email,'password':password,'invite':inv['url'].split('invite=')[1]});sad=admin.ok('state')
    check(sad['role']=='admin','A newly invited admin gets the assigned role')
    email2=suffix+'-new-member@example.com';inv2=admin.ok('team/invite',{'name':'New test member','email':email2,'role':'member'})
    new_member.ok('auth/signup',{'name':'New test member','team':'Invited','email':email2,'password':password,'invite':inv2['url'].split('invite=')[1]});sn=new_member.ok('state');pn=next(p for p in sn['people'] if p['user_id']==sn['user']['id'])
    check(sn['role']=='member' and pn['email']==email2,'The new admin can invite a person with their email and role')
    admin.ok('team/'+pn['id'],{'role':'admin','name':'Updated test member','email':email2},'PATCH');check(new_member.ok('state')['role']=='admin','The new admin can update another person’s name, email and role')
    admin.ok('team/'+pn['id'],{'role':'member'},'PATCH');milestone=admin.ok('actions',{'title':'Admin-created milestone','owner_id':pn['id'],'due_on':'2026-10-15','kind':'milestone'})
    ma=admin.ok('meetings',{'type':'leadership'});admin.ok('meetings/'+ma['id'],{'notes':'The admin assigned a named milestone.','agenda_index':4},'PATCH');admin.ok('meetings/'+ma['id']+'/finish',{'notes':'The admin assigned a named milestone.','ratings':[]})
    history=admin.ok('state');closed=next(m for m in history['meetings'] if m['id']==ma['id']);check(closed['ended_at'] and any(a['id']==milestone['id'] for a in closed['snapshot']['actions']),'The new admin can add a milestone, run and save a meeting, then reopen its history')
    admin.ok('auth/logout',{});admin.ok('auth/login',{'email':email,'password':password});check(any(m['id']==ma['id'] for m in admin.ok('state')['meetings']),'Admin history remains available after signing out and back in')
    b_before=b.ok('state')['workspace']['id'];a.ok('demo/reset',{});check(a.ok('state')['workspace']['id']!=s['workspace']['id'] and b.ok('state')['workspace']['id']==b_before,'Reset replaces only the requesting demo')
if __name__=='__main__':main()
