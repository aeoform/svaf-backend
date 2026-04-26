create table if not exists auth_users (
	id bigserial primary key,
	email text not null unique,
	password_hash text not null,
	display_name text not null default '',
	role text not null default 'user',
	is_active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists auth_users_email_idx on auth_users (email);

create table if not exists ai_modules (
	slug text primary key,
	name text not null,
	tag text not null default '',
	description text not null default '',
	action text not null default '',
	note text not null default '',
	sort_order integer not null default 0,
	is_active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists ai_conversations (
	id bigserial primary key,
	user_id bigint not null references auth_users (id) on delete cascade,
	module_slug text not null references ai_modules (slug) on delete restrict,
	title text not null default '',
	summary text not null default '',
	is_archived boolean not null default false,
	last_message_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists ai_modules_sort_idx on ai_modules (is_active, sort_order, slug);
create index if not exists ai_conversations_user_last_message_idx
	on ai_conversations (user_id, is_archived, last_message_at desc);
