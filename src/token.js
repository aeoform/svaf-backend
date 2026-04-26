import crypto from 'node:crypto';

function base64urlJson(value) {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function parseBase64urlJson(segment) {
	return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

export function signToken(payload, secret, ttlDays) {
	const now = Math.floor(Date.now() / 1000);
	const exp = now + ttlDays * 24 * 60 * 60;
	const header = { alg: 'HS256', typ: 'JWT' };
	const body = { ...payload, iat: now, exp };
	const input = `${base64urlJson(header)}.${base64urlJson(body)}`;
	const signature = crypto.createHmac('sha256', secret).update(input).digest('base64url');
	return `${input}.${signature}`;
}

export function verifyToken(token, secret) {
	try {
		const [headerSeg, bodySeg, signature] = String(token).split('.');
		if (!headerSeg || !bodySeg || !signature) return null;

		const input = `${headerSeg}.${bodySeg}`;
		const expected = crypto.createHmac('sha256', secret).update(input).digest('base64url');
		const actualBuffer = Buffer.from(signature);
		const expectedBuffer = Buffer.from(expected);
		if (actualBuffer.length !== expectedBuffer.length) return null;
		if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

		const header = parseBase64urlJson(headerSeg);
		const body = parseBase64urlJson(bodySeg);
		if (header.alg !== 'HS256') return null;
		if (!body.exp || Math.floor(Date.now() / 1000) >= body.exp) return null;

		return body;
	} catch {
		return null;
	}
}
