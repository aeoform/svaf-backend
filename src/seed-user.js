import postgres from 'postgres';
import { hashPassword } from './password.js';
import { upsertUser } from './users.js';

const databaseUrl = process.env.DATABASE_URL;
const email = String(process.env.EMAIL || '').trim().toLowerCase();
const password = String(process.env.PASSWORD || '');
const displayName = String(process.env.DISPLAY_NAME || '').trim();
const role = String(process.env.ROLE || 'admin').trim() || 'admin';

if (!databaseUrl) {
	throw new Error('DATABASE_URL is required');
}

if (!email) {
	throw new Error('EMAIL is required');
}

if (!password) {
	throw new Error('PASSWORD is required');
}

const sql = postgres(databaseUrl, {
	max: 5,
	idle_timeout: 20,
	connect_timeout: 10
});

const passwordHash = hashPassword(password);

const user = await upsertUser(sql, {
	email,
	passwordHash,
	displayName: displayName || email.split('@')[0],
	role,
	isActive: true
});

console.log(
	JSON.stringify(
		{
			ok: true,
			user: {
				id: String(user.id),
				email: user.email,
				displayName: user.display_name,
				role: user.role
			}
		},
		null,
		2
	)
);

await sql.end();
