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
