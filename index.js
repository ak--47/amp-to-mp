#! /usr/bin/env node
// @ts-check
import u from "ak-tools";
import esMain from 'es-main';
import yargs from "yargs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import mp from 'mixpanel-import';
import path from 'path';
import readline from 'readline';
import { readFileSync, createReadStream } from 'fs';

import MultiStream from "multistream";
dayjs.extend(utc);

/*
----
MAIN
----
*/


/**
 * 
 * @param  {Config} config 
 */
async function main(config) {
	const { project, dir, secret, token, strict, region = 'US', verbose = true, logs = true } = config;
	const l = log(verbose);
	l('start!\n\nsettings:\n');
	l({ project, dir, secret, token, strict, region, verbose, logs });

	/** @type {import('./node_modules/mixpanel-import/types.js').Options} */
	const commonOptions = {
		abridged: true,
		removeNulls: true,
		logs: false,		
		forceStream: true,
		streamFormat: "jsonl",
		workers: 25,
		verbose,
		region,
		strict,
	};

	/** @type {import('./node_modules/mixpanel-import/types.js').Options} */
	const optionsEvents = {
		recordType: 'event',
		//@ts-ignore
		transformFunc: ampEventsToMp,
		...commonOptions
	};

	/** @type {import('./node_modules/mixpanel-import/types.js').Options} */
	const optionsUsers = {
		recordType: 'user',
		fixData: true,
		//@ts-ignore
		transformFunc: ampUserToMp,
		...commonOptions
	};

	/** @type {import('./node_modules/mixpanel-import/types.js').Creds} */
	//@ts-ignore
	const creds = {
		secret,
		token,
		project,

	};

	const files = (await u.ls(path.resolve(dir))).filter(f => fileExt.some((ext) => f.endsWith(ext)));
	l(`\nfound ${files.length} files... starting import\n\n`);

	const streamEvents = new MultiStream(files.reverse().map((file) => { return createReadStream(file); }), { highWaterMark: 2 ^ 27 });
	const streamUsers = new MultiStream(files.map((file) => { return createReadStream(file); }), { highWaterMark: 2 ^ 27 });
	
	//@ts-ignore
	const eventImport = await mp(creds, streamEvents, optionsEvents);
	l(`\n${u.comma(eventImport.success)} events imported`)
	
	//@ts-ignore
	const userImport = await mp(creds, streamUsers, optionsUsers);
	l(`\n${u.comma(userImport.success)} user profiles imported`)
	
	const results = { events: eventImport, users: userImport };
	
	if (logs) {
		await u.mkdir(path.resolve('./logs'));
		await u.touch(path.resolve(`./logs/amplitude-import-log-${Date.now()}.json`), results, true);
	}
	l('\n\nfinish\n\n');
	return results;

}

/*
----
TRANSFORMS
----
*/

function ampEventsToMp(ampEvent) {
	const mixpanelEvent = {
		"event": ampEvent.event_type,
		"properties": {
			"$user_id": ampEvent.user_id || "",
			"$device_id": ampEvent.device_id || "",
			"time": dayjs.utc(ampEvent.event_time).valueOf(),
			"$insert_id": ampEvent.$insert_id,
			"ip": ampEvent.ip_address,
			"$city": ampEvent.city,
			"$region": ampEvent.region,
			"mp_country_code": ampEvent.country,
			"$source": `amplitude-to-mixpanel`
		}

	};

	//get all custom props
	mixpanelEvent.properties = { ...ampEvent.event_properties, ...mixpanelEvent.properties };

	//remove what we don't need
	delete ampEvent.user_id;
	delete ampEvent.device_id;
	delete ampEvent.event_time;
	delete ampEvent.$insert_id;
	delete ampEvent.user_properties;
	delete ampEvent.group_properties;
	delete ampEvent.global_user_properties;
	delete ampEvent.event_properties;
	delete ampEvent.groups;
	delete ampEvent.data;

	//fill in defaults & delete from amp data (if found)
	for (let ampMixPair of ampMixPairs) {
		if (ampEvent[ampMixPair[0]]) {
			mixpanelEvent.properties[ampMixPair[1]] = ampEvent[ampMixPair[0]];
			delete ampEvent[ampMixPair[0]];
		}
	}

	//gather everything else
	mixpanelEvent.properties = { ...ampEvent, ...mixpanelEvent.properties };

	return mixpanelEvent;
}

function ampUserToMp(ampEvent) {
	const userProps = ampEvent.user_properties;
	if (JSON.stringify(userProps) === '{}') return {};
	if (!ampEvent.user_id) return {};

	const mixpanelProfile = {
		"$distinct_id": ampEvent.user_id,
		"$ip": ampEvent.ip_address,
		"$set": ampEvent.user_properties
	};

	//include defaults, if they exist
	for (let ampMixPair of ampMixPairs) {
		if (ampEvent[ampMixPair[0]]) {
			mixpanelProfile.$set[ampMixPair[1]] = ampEvent[ampMixPair[0]];
		}
	}

	return mixpanelProfile;
}

function ampGroupToMp(ampEvent) {
	//todo
}


/*
----
CLI
----
*/


function cli() {
	if (process?.argv?.slice()?.pop()?.endsWith('.json')) {
		try {
			//@ts-ignore
			const config = JSON.parse(readFileSync(path.resolve(process.argv.slice().pop())));
			return config;
		}
		catch (e) {
			//noop
		}
	}

	const args = yargs(process.argv.splice(2))
		.scriptName("")
		.command('$0', 'usage:\nnpx amp-to-mp --dir ./data --token bar --secret qux --project foo ', () => { })
		.option("dir", {
			alias: 'file',
			demandOption: true,
			describe: 'path to UNCOMPRESSED amplitude event file(s)',
			type: 'string'
		})
		.option("token", {
			demandOption: true,
			describe: 'mp token',
			type: 'string'
		})
		.option("secret", {
			demandOption: true,
			describe: 'mp secret',
			type: 'string'
		})
		.option("project", {
			demandOption: true,
			describe: 'mp project id',
			type: 'number'
		})
		.option("region", {
			demandOption: false,
			default: 'US',
			describe: 'US or EU',
			type: 'string'
		})
		.option("strict", {
			demandOption: false,
			default: false,
			describe: 'baz',
			type: 'boolean'
		})
		.option("verbose", {
			demandOption: false,
			default: true,
			describe: 'log messages',
			type: 'boolean'
		})
		.option("logs", {
			demandOption: false,
			default: true,
			describe: 'write logfile',
			type: 'boolean'
		})
		.help()
		.argv;
	/** @type {Config} */
	return args;
}

/*
----
LOGGING
----
*/

function summarize(data) {
	const summary = data.reduce(function (acc, curr, index, array) {
		acc.batches += curr.batches;
		acc.duration += curr.duration;
		acc.failed += curr.failed;
		acc.requests += curr.requests;
		acc.retries += curr.retries;
		acc.success += curr.success;
		acc.total += curr.total;

		acc.eps = u.avg(acc.eps, curr.eps);
		acc.rps = u.avg(acc.rps, curr.rps);

		acc.errors = [...acc.errors, ...curr.errors];
		acc.responses = [...acc.responses, ...curr.responses];
		acc.recordType = curr.recordType;
		return acc;
	}, {
		batches: 0,
		duration: 0,
		eps: 0,
		errors: [],
		failed: 0,
		recordType: '',
		requests: 0,
		responses: [],
		retries: 0,
		rps: 0,
		success: 0,
		total: 0,

	});
	return summary;
}

function log(verbose) {
	return function (data) {		
		if (verbose) console.log(data);
	};
}


/*
----
RANDOM
----
*/

//amp to mp default props
// ? https://developers.amplitude.com/docs/identify-api
// ? https://help.mixpanel.com/hc/en-us/articles/115004613766-Default-Properties-Collected-by-Mixpanel
const ampMixPairs = [
	["app_version", "$app_version_string"],
	["os_name", "$os"],
	["os_name", "$browser"],
	["os_version", "$os_version"],
	["device_brand", "$brand"],
	["device_manufacturer", "$manufacturer"],
	["device_model", "$model"],
	["region", "$region"],
	["city", "$city"]
];

const fileExt = ['json', 'jsonl', 'ndjson'];

const hero = String.raw`
 _     _      /___ | ___\         _ 
|_||V||_)    < ___ | ___ >    |V||_)
| || ||       \    |    /     | ||  
	       r&r by AK
`;

/*
----
EXPORTS
----
*/

export default main;

if (esMain(import.meta)) {
	console.log(hero);
	//@ts-ignore
	const params = cli();
	//@ts-ignore
	main(params)
		.then(() => {
			console.log(`\n\nhooray! all done!\n\n`);
		}).catch((e) => {
			console.log(`\n\nuh oh! something didn't work...\nthe error message is:\n\n\t${e.message}\n\n@\n\n${e.stack}\n\n`);
		}).finally(() => {
			console.log('\n\nhave a great day!\n\n');
			process.exit(0);
		});

}

