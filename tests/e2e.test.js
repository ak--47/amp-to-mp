/* cSpell:disable */
// @ts-nocheck
/* eslint-disable no-undef */
/* eslint-disable no-debugger */
/* eslint-disable no-unused-vars */
import main from "../index.js";
import dotenv from 'dotenv';
import { execSync } from "child_process";
import { createReadStream } from "fs";
dotenv.config();
const project = process.env.MP_PROJECT;
const token = process.env.MP_TOKEN;
const secret = process.env.MP_SECRET;
const timeout = 60000;


const CONFIG = {
	dir: "./data/sample/pintara",
	token,
	secret,
	project,
	strict: true,
	region: 'US',
	events: true,
	users: true,
	groups: false,
	verbose: false,
	logs: true,
};


describe('e2e', () => {
	test('works as module', async () => {
		console.log('MODULE TEST');
		const { events, users, groups } = await main(CONFIG);
		expect(events.success).toBe(8245);
		expect(events.failed).toBe(0);
		expect(users.success).toBe(350);
		expect(users.failed).toBe(0);
		expect(JSON.stringify(groups)).toBe('{}');

	}, timeout);

	test('works as CLI', async () => {
		console.log('CLI TEST');
		const { dir,
			token,
			secret,
			project,
			strict,
			region,
			events,
			users,
			groups,
			verbose } = CONFIG;
		const run = execSync(`node ./index.js --dir ${dir} --token ${token} --secret ${secret} --project ${project} --region ${region} --strict ${strict} --events ${events} --users ${users} --grouos ${groups} --verbose ${verbose}`);
		expect(run.toString().trim().includes('hooray! all done!')).toBe(true);
	}, timeout);

	//todo test custom id resolution


	test('works with individual files', async () => {
		console.log('INDIVIDUAL FILES TEST');
		const { events, users, groups } = await main({
			...CONFIG,
			file: './data/sample/pintara/2023-04-10_11#0.json'
		});
		expect(events.success).toBe(8245);
		expect(events.failed).toBe(0);
		expect(users.success).toBe(350);
		expect(users.failed).toBe(0);
		expect(JSON.stringify(groups)).toBe('{}');
	}, timeout);

	test('works with streams', async () => {
		console.log('STREAM TEST');
		const { events, users, groups } = await main({
			...CONFIG,
			stream: createReadStream('./data/sample/pintara/2023-04-10_12#0.json')
		});
		expect(events.success).toBe(8245);
		expect(events.failed).toBe(0);
		expect(users.success).toBe(350);
		expect(users.failed).toBe(0);
		expect(JSON.stringify(groups)).toBe('{}');
	}, timeout);
});




afterAll(() => {

	// console.log('TEST FINISHED deleting entities...');
	// execSync(`npm run delete`);
	// console.log('...entities deleted 👍');
	console.log('clearing logs...');
	execSync(`npm run prune`);
	console.log('...logs cleared 👍');
});