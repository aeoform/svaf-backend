import http from 'node:http';
import postgres from 'postgres';
import { signToken, verifyToken } from './token.js';
import { verifyPassword } from './password.js';
import { findUserByEmail } from './users.js';
import {
	ensureAiSchema,
	getAiModelStatus,
	getAiConversation,
	listAiConversations,
	listAiMessages,
	pullAiChatStream,
	startAiChatStream
} from './ai.js';

const port = Number(process.env.PORT || 8787);
const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.AUTH_SECRET;
const corsOrigin = process.env.CORS_ORIGIN || '*';
const tokenTtlDays = Number(process.env.TOKEN_TTL_DAYS || 7);

if (!databaseUrl) {
	throw new Error('DATABASE_URL is required');
}

if (!authSecret) {
	throw new Error('AUTH_SECRET is required');
}

const sql = postgres(databaseUrl, {
	max: 5,
	idle_timeout: 20,
	connect_timeout: 10
});

function json(res, status, body) {
	const headers = {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'access-control-allow-origin': corsOrigin,
		'access-control-allow-headers': 'content-type, authorization',
		'access-control-allow-methods': 'GET,POST,OPTIONS'
	};

	res.writeHead(status, headers);
	res.end(JSON.stringify(body));
}

function text(res, status, body) {
	res.writeHead(status, {
		'content-type': 'text/plain; charset=utf-8',
		'cache-control': 'no-store',
		'access-control-allow-origin': corsOrigin,
		'access-control-allow-headers': 'content-type, authorization',
		'access-control-allow-methods': 'GET,POST,OPTIONS'
	});
	res.end(body);
}

function readJson(req) {
	return new Promise((resolve, reject) => {
		let raw = '';
		req.on('data', chunk => {
			raw += chunk;
			if (raw.length > 1_000_000) {
				reject(new Error('Payload too large'));
				req.destroy();
			}
		});
		req.on('end', () => {
			if (!raw.trim()) {
				resolve({});
				return;
			}
			try {
				resolve(JSON.parse(raw));
			} catch {
				reject(new Error('Invalid JSON'));
			}
		});
		req.on('error', reject);
	});
}

function normalizeEmail(email) {
	return String(email || '').trim().toLowerCase();
}

function getBearerToken(req) {
	const auth = req.headers.authorization || '';
	return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

function getCurrentUser(req) {
	const token = getBearerToken(req);
	if (!token) return null;

	return verifyToken(token, authSecret);
}

async function loginHandler(req, res) {
	let payload;
	try {
		payload = await readJson(req);
	} catch (error) {
		return json(res, 400, { ok: false, error: error.message });
	}

	const email = normalizeEmail(payload.email);
	const password = String(payload.password || '');

	if (!email || !password) {
		return json(res, 400, { ok: false, error: 'email and password are required' });
	}

	const user = await findUserByEmail(sql, email);
	if (!user || !user.is_active) {
		return json(res, 401, { ok: false, error: 'invalid credentials' });
	}

	if (!verifyPassword(password, user.password_hash)) {
		return json(res, 401, { ok: false, error: 'invalid credentials' });
	}

	const token = signToken(
		{
			sub: String(user.id),
			email: user.email,
			role: user.role,
			name: user.display_name
		},
		authSecret,
		tokenTtlDays
	);

	return json(res, 200, {
		ok: true,
		token,
		user: {
			id: String(user.id),
			email: user.email,
			displayName: user.display_name,
			role: user.role
		}
	});
}

async function meHandler(req, res) {
	const auth = req.headers.authorization || '';
	const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!token) return json(res, 401, { ok: false, error: 'missing token' });

	const payload = verifyToken(token, authSecret);
	if (!payload) return json(res, 401, { ok: false, error: 'invalid token' });

	return json(res, 200, {
		ok: true,
		user: {
			id: payload.sub,
			email: payload.email,
			role: payload.role,
			displayName: payload.name
		}
	});
}

async function conversationsHandler(req, res, url) {
	const currentUser = getCurrentUser(req);
	if (!currentUser) return json(res, 401, { ok: false, error: 'missing token' });

	const moduleSlug = url.searchParams.get('module') || '';
	const limit = Number(url.searchParams.get('limit') || 10);
	const conversations = await listAiConversations(sql, currentUser.sub, {
		moduleSlug,
		limit
	});

	return json(res, 200, { ok: true, conversations });
}

async function conversationMessagesHandler(req, res, url) {
	const currentUser = getCurrentUser(req);
	if (!currentUser) return json(res, 401, { ok: false, error: 'missing token' });

	const match = url.pathname.match(/^\/ai\/conversations\/(\d+)\/messages$/);
	if (!match) return json(res, 404, { ok: false, error: 'not found' });

	const conversation = await getAiConversation(sql, currentUser.sub, match[1]);
	if (!conversation) return json(res, 404, { ok: false, error: 'conversation not found' });

	const limit = Number(url.searchParams.get('limit') || 60);
	const messages = await listAiMessages(sql, currentUser.sub, match[1], limit);
	return json(res, 200, { ok: true, conversation, messages });
}

async function chatStartHandler(req, res) {
	const currentUser = getCurrentUser(req);
	if (!currentUser) return json(res, 401, { ok: false, error: 'missing token' });

	let payload;
	try {
		payload = await readJson(req);
	} catch (error) {
		return json(res, 400, { ok: false, error: error.message });
	}

	try {
		const result = await startAiChatStream(sql, {
			userId: currentUser.sub,
			moduleSlug: payload.moduleSlug || 'chat',
			conversationId: payload.conversationId || null,
			content: payload.content
		});

		return json(res, 200, { ok: true, ...result });
	} catch (error) {
		return json(res, 400, { ok: false, error: error.message || 'chat failed' });
	}
}

async function chatStreamHandler(req, res, url) {
	const currentUser = getCurrentUser(req);
	if (!currentUser) return json(res, 401, { ok: false, error: 'missing token' });

	const match = url.pathname.match(/^\/ai\/chat\/stream\/([^/]+)$/);
	if (!match) return json(res, 404, { ok: false, error: 'not found' });
	const cursor = Number(url.searchParams.get('cursor') || 0);

	try {
		const result = await pullAiChatStream(sql, {
			userId: currentUser.sub,
			streamId: match[1],
			cursor
		});

		return json(res, 200, { ok: true, ...result });
	} catch (error) {
		return json(res, 404, { ok: false, error: error.message || 'stream not found' });
	}
}

async function modelStatusHandler(req, res) {
	const currentUser = getCurrentUser(req);
	if (!currentUser) return json(res, 401, { ok: false, error: 'missing token' });

	return json(res, 200, {
		ok: true,
		model: getAiModelStatus()
	});
}

await ensureAiSchema(sql);

const server = http.createServer(async (req, res) => {
	if (req.method === 'OPTIONS') {
		res.writeHead(204, {
			'access-control-allow-origin': corsOrigin,
			'access-control-allow-headers': 'content-type, authorization',
			'access-control-allow-methods': 'GET,POST,OPTIONS'
		});
		res.end();
		return;
	}

	const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

	if (req.method === 'GET' && url.pathname === '/health') {
		text(res, 200, 'ok');
		return;
	}

	if (req.method === 'POST' && url.pathname === '/auth/login') {
		await loginHandler(req, res);
		return;
	}

	if (req.method === 'GET' && url.pathname === '/auth/me') {
		await meHandler(req, res);
		return;
	}

	if (req.method === 'GET' && url.pathname === '/ai/conversations') {
		await conversationsHandler(req, res, url);
		return;
	}

	if (req.method === 'GET' && /^\/ai\/conversations\/\d+\/messages$/.test(url.pathname)) {
		await conversationMessagesHandler(req, res, url);
		return;
	}

	if (req.method === 'POST' && url.pathname === '/ai/chat/start') {
		await chatStartHandler(req, res);
		return;
	}

	if (req.method === 'GET' && /^\/ai\/chat\/stream\/[^/]+$/.test(url.pathname)) {
		await chatStreamHandler(req, res, url);
		return;
	}

	if (req.method === 'GET' && url.pathname === '/ai/model-status') {
		await modelStatusHandler(req, res);
		return;
	}

	json(res, 404, { ok: false, error: 'not found' });
});

server.listen(port, () => {
	console.log(`svaf backend listening on http://127.0.0.1:${port}`);
});
