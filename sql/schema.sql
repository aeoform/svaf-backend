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

create table if not exists ai_conversations (
	id bigserial primary key,
	user_id bigint not null references auth_users (id) on delete cascade,
	module_slug text not null default 'chat',
	title text not null default '',
	summary text not null default '',
	is_archived boolean not null default false,
	last_message_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists ai_messages (
	id bigserial primary key,
	conversation_id bigint not null references ai_conversations (id) on delete cascade,
	role text not null,
	content text not null,
	created_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_last_message_idx
	on ai_conversations (user_id, is_archived, last_message_at desc);
create index if not exists ai_messages_conversation_created_idx on ai_messages (conversation_id, created_at asc);

create table if not exists ai_stream_jobs (
	id text primary key,
	user_id bigint not null references auth_users (id) on delete cascade,
	conversation_id bigint not null references ai_conversations (id) on delete cascade,
	module_slug text not null default 'chat',
	client_request_id text not null default '',
	user_content text not null default '',
	assistant_content text not null default '',
	done boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists ai_stream_jobs_user_done_updated_idx
	on ai_stream_jobs (user_id, done, updated_at desc);

create unique index if not exists ai_stream_jobs_user_request_idx
	on ai_stream_jobs (user_id, client_request_id)
	where client_request_id <> '';
