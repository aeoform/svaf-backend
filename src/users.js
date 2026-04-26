export async function findUserByEmail(sql, email) {
	const rows = await sql`
		select id, email, display_name, role, password_hash, is_active
		from auth_users
		where email = ${email}
		limit 1
	`;
	return rows[0] || null;
}

export async function upsertUser(
	sql,
	{ email, passwordHash, displayName = '', role = 'user', isActive = true }
) {
	const rows = await sql`
		insert into auth_users (
			email,
			password_hash,
			display_name,
			role,
			is_active
		)
		values (
			${email},
			${passwordHash},
			${displayName},
			${role},
			${isActive}
		)
		on conflict (email) do update set
			password_hash = excluded.password_hash,
			display_name = excluded.display_name,
			role = excluded.role,
			is_active = excluded.is_active,
			updated_at = now()
		returning id, email, display_name, role, is_active
	`;

	return rows[0];
}
