"""Existing-account invitation regression checks, using disposable fictional accounts."""
from live_checks import Client, check, ROOT, checks
import json, secrets

suffix=secrets.token_hex(6)
password=secrets.token_urlsafe(22)
owner, existing, outsider = Client(), Client(), Client()
for client,name in [(owner,'Owner'),(existing,'Existing'),(outsider,'Outsider')]:
    client.ok('auth/signup',{'name':'Fictional '+name,'team':'Invite test '+suffix+' '+name,'email':suffix+'-'+name.lower()+'@example.com','password':password})
target=owner.ok('state')['workspace']['id']
email=suffix+'-existing@example.com'
inv=owner.ok('team/invite',{'name':'Fictional invited admin','email':email,'role':'admin'})
token=inv['url'].split('invite=')[1]
wrong=outsider.call('auth/login',{'email':suffix+'-outsider@example.com','password':password,'invite':token})
check(wrong[0]==400,'A different authenticated email cannot consume an invitation')
existing.ok('auth/login',{'email':email,'password':password,'invite':token})
state=existing.ok('state')
check(state['workspace']['id']==target and state['role']=='admin','An existing account accepts an invitation and opens the invited workspace')
check(sum(p['user_id']==state['user']['id'] for p in state['people'])==1,'Existing-account invite creates exactly one participant')
check(existing.call('auth/login',{'email':email,'password':password,'invite':token})[0]==400,'An accepted invitation cannot be reused')
# An invitation to an existing owner must not silently demote their membership.
owner_email=suffix+'-owner@example.com'
own_inv=owner.ok('team/invite',{'name':'Fictional owner','email':owner_email,'role':'member'})
owner.ok('auth/login',{'email':owner_email,'password':password,'invite':own_inv['url'].split('invite=')[1]})
state=owner.ok('state')
check(state['role']=='owner' and sum(p['user_id']==state['user']['id'] for p in state['people'])==1,'Accepting an invite preserves existing ownership and avoids duplicate people')
(ROOT/'output/verification/invitation-checks.json').write_text(json.dumps({'status':'passed','passed':checks,'count':len(checks)},indent=2))
