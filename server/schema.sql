create schema if not exists rhythm;
create table if not exists rhythm.workspaces (
 id uuid primary key default gen_random_uuid(), name text not null,
 is_demo boolean not null default false, ai_calls integer not null default 0,
 created_at timestamptz not null default now()
);
create table if not exists rhythm.memberships (
 workspace_id uuid not null references rhythm.workspaces on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 role text not null check(role in ('owner','admin','member')),
 primary key(workspace_id,user_id)
);
create table if not exists rhythm.people (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references rhythm.workspaces on delete cascade,
 user_id uuid references auth.users, name text not null, email text, role text not null default 'member', active boolean not null default true
);
create table if not exists rhythm.signals (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references rhythm.workspaces on delete cascade,
 name text not null, unit text not null, owner_id uuid references rhythm.people,
 target numeric not null, direction text not null check(direction in ('higher','lower')),
 active boolean not null default true
);
create table if not exists rhythm.signal_results (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references rhythm.workspaces on delete cascade,
 signal_id uuid not null references rhythm.signals on delete cascade, period_date date not null,
 value numeric not null, target_snapshot numeric not null, owner_snapshot uuid references rhythm.people,
 assessment text not null default 'Healthy' check(assessment in ('Healthy','Watch','Needs help')), context text not null default '',
 unique(signal_id,period_date)
);
create table if not exists rhythm.preparations (
 workspace_id uuid not null references rhythm.workspaces on delete cascade, person_id uuid not null references rhythm.people on delete cascade,
 week_date date not null, priorities jsonb not null default '[]', win text not null default '', blocker text not null default '',
 updated_at timestamptz not null default now(), primary key(workspace_id,person_id,week_date)
);
create table if not exists rhythm.meetings (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references rhythm.workspaces on delete cascade,
 title text not null, type text not null default 'weekly', started_at timestamptz not null default now(), ended_at timestamptz,
 notes text not null default '', private_people uuid[], snapshot jsonb,
 agenda_index integer not null default 0
);
create table if not exists rhythm.actions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references rhythm.workspaces on delete cascade,
 meeting_id uuid references rhythm.meetings, title text not null, owner_id uuid references rhythm.people,
 due_on date, original_due_on date, status text not null default 'open' check(status in ('open','done')),
 kind text not null default 'action', source_id uuid, source_ref text, source_excerpt text,
 created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists rhythm.action_events (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references rhythm.workspaces on delete cascade,
 action_id uuid not null references rhythm.actions on delete cascade,
 happened_at timestamptz not null default now(), event_type text not null, previous jsonb, current jsonb,
 reason text, recorded_by uuid references auth.users
);
create table if not exists rhythm.ratings (
 workspace_id uuid not null references rhythm.workspaces on delete cascade, meeting_id uuid not null references rhythm.meetings on delete cascade,
 person_id uuid not null references rhythm.people, score integer not null check(score between 1 and 10), primary key(meeting_id,person_id)
);
create table if not exists rhythm.issues (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references rhythm.workspaces on delete cascade,
 meeting_id uuid references rhythm.meetings on delete cascade, title text not null, status text not null default 'open'
);
create table if not exists rhythm.sources (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references rhythm.workspaces on delete cascade,
 title text not null, text_content text not null default '', source_date date, timezone text,
 review jsonb, imported_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists rhythm.settings (
 workspace_id uuid primary key references rhythm.workspaces on delete cascade, encrypted_key text,
 model text not null default 'google/gemini-2.5-flash', key_suffix text
);
create table if not exists rhythm.invites (
 token_hash text primary key, workspace_id uuid not null references rhythm.workspaces on delete cascade,
 name text not null, email text not null, expires_at timestamptz not null, accepted_at timestamptz, role text not null default 'member'
);
alter table rhythm.memberships drop constraint if exists memberships_role_check;
alter table rhythm.memberships add constraint memberships_role_check check(role in ('owner','admin','member'));
alter table rhythm.people add column if not exists role text not null default 'member';
alter table rhythm.invites add column if not exists role text not null default 'member';
update rhythm.people p set role=m.role from rhythm.memberships m where p.workspace_id=m.workspace_id and p.user_id=m.user_id;
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='rhythm' loop
  execute format('alter table rhythm.%I enable row level security',t.tablename);
 end loop;
end $$;
revoke all on schema rhythm from public, anon, authenticated;
create index if not exists actions_workspace_idx on rhythm.actions(workspace_id);
create index if not exists meetings_workspace_idx on rhythm.meetings(workspace_id,started_at);
create index if not exists sources_workspace_idx on rhythm.sources(workspace_id);
