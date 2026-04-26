const streamJobs = new Map();

function normalizeConversation(row) {
	return {
		id: String(row.id),
		userId: String(row.user_id),
		moduleSlug: row.module_slug,
		title: row.title,
		summary: row.summary,
		isArchived: row.is_archived,
		lastMessageAt: row.last_message_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function normalizeMessage(row) {
	return {
		id: String(row.id),
		conversationId: String(row.conversation_id),
		role: row.role,
		content: row.content,
		createdAt: row.created_at
	};
}

function buildConversationTitle(content) {
	const compact = String(content || '')
		.trim()
		.replace(/\s+/g, ' ');
	if (!compact) return '新对话';
	return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact;
}

function buildAssistantReply({ moduleSlug, content }) {
	const compact = String(content || '')
		.trim()
		.replace(/\s+/g, ' ');
	if (!compact) {
		return '我已经收到你的消息。你可以继续补充细节，我会保留这段对话。';
	}

	if (moduleSlug === 'chat') {
		return `收到。当前还是基础对话模式，后面可以接真实模型。你刚才说的是：${compact.slice(0, 180)}`;
	}

	return `已记录到「${moduleSlug}」模块。当前是基础版对话，后面可以继续接真实能力。你说的是：${compact.slice(0, 180)}`;
}

function getModelSettings() {
	const baseUrl = String(process.env.MODEL_API_BASE_URL || '').trim();
	const apiKey = String(process.env.MODEL_API_KEY || '').trim();
	const model = String(process.env.MODEL_MODEL || '').trim() || 'gpt-4o-mini';
	const provider = String(process.env.MODEL_PROVIDER || '').trim() || 'openai-compatible';
	const path = String(process.env.MODEL_API_PATH || '').trim() || '/v1/chat/completions';
	const systemPrompt =
		String(process.env.MODEL_SYSTEM_PROMPT || '').trim() ||
		'你是云外拾光站点里的 AI 助手，回答要简洁、准确、用中文。';

	return {
		enabled: !!baseUrl && !!apiKey,
		baseUrl,
		apiKey,
		model,
		provider,
		path,
		systemPrompt
	};
}

export function getAiModelStatus() {
	const settings = getModelSettings();
	return {
		enabled: settings.enabled,
		provider: settings.provider,
		model: settings.model,
		baseUrl: settings.baseUrl ? new URL(settings.baseUrl).origin : '',
		path: settings.path,
		variables: {
			MODEL_API_BASE_URL: Boolean(settings.baseUrl),
			MODEL_API_KEY: Boolean(settings.apiKey),
			MODEL_MODEL: Boolean(settings.model),
			MODEL_PROVIDER: Boolean(settings.provider),
			MODEL_API_PATH: Boolean(settings.path),
			MODEL_SYSTEM_PROMPT: Boolean(settings.systemPrompt)
		}
	};
}

async function generateAssistantReply({ moduleSlug, content, history = [] }) {
	const settings = getModelSettings();
	if (!settings.enabled) {
		return buildAssistantReply({ moduleSlug, content });
	}

	try {
		const messages = [
			{
				role: 'system',
				content: `${settings.systemPrompt}\n当前模块：${moduleSlug}\n你只需要给出与当前模块有关的回答。`
			},
			...history.slice(-20).map(message => ({
				role: message.role === 'assistant' ? 'assistant' : 'user',
				content: String(message.content || '')
			}))
		];

		const response = await fetch(new URL(settings.path, settings.baseUrl).toString(), {
			method: 'POST',
			headers: {
				authorization: `Bearer ${settings.apiKey}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				model: settings.model,
				messages,
				temperature: 0.7
			})
		});

		const data = await response.json().catch(() => null);
		const reply = data?.choices?.[0]?.message?.content?.trim();
		if (response.ok && reply) {
			return reply;
		}
	} catch {
		// Fall through to the local reply.
	}

	return buildAssistantReply({ moduleSlug, content });
}

export async function ensureAiSchema(sql) {
	await sql`
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
		)
	`;

	await sql`
		create table if not exists ai_messages (
			id bigserial primary key,
			conversation_id bigint not null references ai_conversations (id) on delete cascade,
			role text not null,
			content text not null,
			created_at timestamptz not null default now()
		)
	`;
	await sql`
		create index if not exists ai_conversations_user_last_message_idx
		on ai_conversations (user_id, is_archived, last_message_at desc)
	`;
	await sql`
		create index if not exists ai_messages_conversation_created_idx
		on ai_messages (conversation_id, created_at asc)
	`;
}

export async function listAiConversations(sql, userId, { moduleSlug = '', limit = 10 } = {}) {
	const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 20);
	const normalizedModuleSlug = String(moduleSlug || '').trim();

	const rows = normalizedModuleSlug
		? await sql`
			select id, user_id, module_slug, title, summary, is_archived, last_message_at, created_at, updated_at
			from ai_conversations
			where user_id = ${userId}
				and is_archived = false
				and module_slug = ${normalizedModuleSlug}
			order by last_message_at desc
			limit ${safeLimit}
		`
		: await sql`
			select id, user_id, module_slug, title, summary, is_archived, last_message_at, created_at, updated_at
			from ai_conversations
			where user_id = ${userId}
				and is_archived = false
			order by last_message_at desc
			limit ${safeLimit}
		`;

	return rows.map(normalizeConversation);
}

export async function getAiConversation(sql, userId, conversationId) {
	const rows = await sql`
		select id, user_id, module_slug, title, summary, is_archived, last_message_at, created_at, updated_at
		from ai_conversations
		where id = ${conversationId}
			and user_id = ${userId}
			and is_archived = false
		limit 1
	`;

	return rows[0] ? normalizeConversation(rows[0]) : null;
}

export async function listAiMessages(sql, userId, conversationId, limit = 60) {
	const rows = await sql`
		select m.id, m.conversation_id, m.role, m.content, m.created_at
		from ai_messages m
		join ai_conversations c on c.id = m.conversation_id
		where m.conversation_id = ${conversationId}
			and c.user_id = ${userId}
		order by m.created_at asc
		limit ${Math.min(Math.max(Number(limit) || 60, 1), 120)}
	`;

	return rows.map(normalizeMessage);
}

function splitStreamText(text) {
	const compact = String(text || '').trim();
	if (!compact) return [''];

	const chunks = [];
	let index = 0;
	const size = compact.length > 240 ? 18 : 12;
	while (index < compact.length) {
		chunks.push(compact.slice(index, index + size));
		index += size;
	}

	return chunks;
}

export async function startAiChatStream(sql, { userId, moduleSlug = 'chat', conversationId = null, content }) {
	const cleanContent = String(content || '').trim();
	if (!cleanContent) {
		throw new Error('content is required');
	}

	return sql.begin(async tx => {
		let conversation = null;
		if (conversationId) {
			conversation = await getAiConversation(tx, userId, conversationId);
		}

		if (!conversation) {
			const created = await tx`
				insert into ai_conversations (user_id, module_slug, title, summary, last_message_at)
				values (
					${userId},
					${String(moduleSlug || 'chat') || 'chat'},
					${buildConversationTitle(cleanContent)},
					${cleanContent.slice(0, 160)},
					now()
				)
				returning id, user_id, module_slug, title, summary, is_archived, last_message_at, created_at, updated_at
			`;
			conversation = normalizeConversation(created[0]);
		}

		await tx`
			insert into ai_messages (conversation_id, role, content)
			values (${conversation.id}, 'user', ${cleanContent})
		`;

		await tx`
			update ai_conversations
			set
				last_message_at = now(),
				updated_at = now()
			where id = ${conversation.id}
		`;

		const history = await listAiMessages(tx, userId, conversation.id, 40);
		const assistantContent = await generateAssistantReply({
			moduleSlug: conversation.moduleSlug,
			content: cleanContent,
			history
		});

		const streamId = crypto.randomUUID();
		streamJobs.set(streamId, {
			id: streamId,
			userId: String(userId),
			conversationId: String(conversation.id),
			moduleSlug: String(conversation.moduleSlug || moduleSlug || 'chat'),
			assistantContent,
			chunks: splitStreamText(assistantContent),
			cursor: 0,
			done: false,
			finalResult: null
		});

		return {
			streamId,
			conversation,
			userMessage: {
				id: String(Date.now()),
				conversationId: String(conversation.id),
				role: 'user',
				content: cleanContent,
				createdAt: new Date().toISOString()
			}
		};
	});
}

async function persistStreamCompletion(sql, job) {
	await sql.begin(async tx => {
		await tx`
			insert into ai_messages (conversation_id, role, content)
			values (${job.conversationId}, 'assistant', ${job.assistantContent})
		`;

		await tx`
			update ai_conversations
			set
				summary = ${job.assistantContent.slice(0, 160)},
				last_message_at = now(),
				updated_at = now()
			where id = ${job.conversationId}
		`;

		const conversation = await getAiConversation(tx, job.userId, job.conversationId);
		const messages = await listAiMessages(tx, job.userId, job.conversationId);
		job.finalResult = {
			conversation,
			messages
		};
	});
}

export async function pullAiChatStream(sql, { userId, streamId }) {
	const job = streamJobs.get(String(streamId));
	if (!job) {
		return { done: true, delta: '', conversation: null, messages: [] };
	}

	if (job.userId !== String(userId)) {
		throw new Error('stream not found');
	}

	if (job.done) {
		return {
			done: true,
			delta: '',
			conversation: job.finalResult?.conversation || null,
			messages: job.finalResult?.messages || []
		};
	}

	const delta = job.chunks[job.cursor] || '';
	job.cursor += 1;

	if (job.cursor >= job.chunks.length) {
		job.done = true;
		await persistStreamCompletion(sql, job);
		return {
			done: true,
			delta,
			conversation: job.finalResult?.conversation || null,
			messages: job.finalResult?.messages || []
		};
	}

	return {
		done: false,
		delta
	};
}
