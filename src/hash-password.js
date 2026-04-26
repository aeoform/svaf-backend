import readline from 'node:readline';
import { hashPassword } from './password.js';

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

rl.question('Password: ', password => {
	console.log(hashPassword(password));
	rl.close();
});
