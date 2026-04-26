import crypto from 'node:crypto';

const PREFIX = 'pbkdf2_sha256';
const ITERATIONS = 210000;
const KEYLEN = 32;

function toBase64Url(input) {
	return Buffer.from(input).toString('base64url');
}

function fromBase64Url(input) {
	return Buffer.from(input, 'base64url');
}

export function hashPassword(password, salt = crypto.randomBytes(16)) {
	const derived = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, 'sha256');
	return [PREFIX, ITERATIONS, toBase64Url(salt), toBase64Url(derived)].join('$');
}

export function verifyPassword(password, storedHash) {
	const [prefix, iterationsRaw, saltRaw, hashRaw] = String(storedHash).split('$');
	if (prefix !== PREFIX) return false;
	const iterations = Number(iterationsRaw);
	if (!Number.isFinite(iterations) || iterations <= 0) return false;
	const salt = fromBase64Url(saltRaw);
	const expected = fromBase64Url(hashRaw);
	const actual = crypto.pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');
	return crypto.timingSafeEqual(actual, expected);
}
