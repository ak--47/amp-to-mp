#! /usr/bin/env node
// @ts-check
import u from "ak-tools";
import esMain from "es-main";
import yargs from "yargs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import mp from "mixpanel-import";
import path from "path";
import { lstatSync } from "fs";
dayjs.extend(utc);

/*
----
MAIN
----
*/

/**
 *
 * @param  {import('./types.d.ts').Config} config
 */
async function main(config) {
	const {
		project,
		dir = "",
		file = "",
		secret,
		token,
		strict,
		region = "US",
		verbose = false,
		logs = false,
		events = true,
		users = true,
		groups = false,
		custom_user_id = "user_id",
		aliases = {},
		tags = {},
		stream = null,
		...otherOpts
	} = config;
	const transformOpts = { custom_user_id };
	const l = log(verbose);
	l("start!\n\nsettings:\n");
	l({ project, dir, file, stream, secret, token, strict, region, verbose, logs, events, users, groups, custom_user_id, aliases, tags, ...otherOpts });

	/** @type {import('mixpanel-import').Options} */
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
		aliases,
		tags,
		...otherOpts
	};

	/** @type {import('mixpanel-import').Options} */
	const optionsEvents = {
		recordType: "event",
		compress: true,
		//@ts-ignore
		transformFunc: ampEventsToMp(transformOpts),
		...commonOptions
	};

	/** @type {import('mixpanel-import').Options} */
	const optionsUsers = {
		recordType: "user",
		fixData: true,
		dedupe: true, //cuts down on the number of requests when the user_properties are the same
		//@ts-ignore
		transformFunc: ampUserToMp(transformOpts),
		...commonOptions
	};

	/** @type {import('mixpanel-import').Options} */
	const optionsGroup = {
		recordType: "group",
		fixData: true,
		//@ts-ignore
		transformFunc: ampGroupToMp(transformOpts),
		...commonOptions
	};

	/** @type {import('mixpanel-import').Creds} */
	//@ts-ignore
	const creds = {
		secret,
		token,
		project
	};
	const data = dir || file ? path.resolve(dir || file) : stream;
	if (typeof data === "string") {
		let pathInfos;
		try {
			pathInfos = lstatSync(data);
		} catch (e) {
			throw `path ${data} not found; file or folder does not exist`;
		}


		if (verbose) {
			//file case
			if (pathInfos.isFile()) {
				l(`\nfound 1 file... starting import\n\n`);
			}
			//folder case
			if (pathInfos.isDirectory()) {
				const numFiles = (await u.ls(data)).filter(f => fileExt.some(ext => f.endsWith(ext)));
				l(`\nfound ${numFiles.length} files... starting import\n\n`);
			}
		}
	}

	let eventImport = {};
	let userImport = {};
	let groupImport = {};

	const tasks = [];

	if (users) {
		tasks.push((async () => {
			//@ts-ignore
			userImport = await mp(creds, data, optionsUsers);
			l(`\n${u.comma(userImport.success)} user profiles imported`);
		})());
	}
	
	if (events) {
		tasks.push((async () => {
			//@ts-ignore
			eventImport = await mp(creds, data, optionsEvents);
			l(`\n${u.comma(eventImport.success)} events imported`);
		})());
	}
	
	if (groups) {
		tasks.push((async () => {
			//@ts-ignore
			groupImport = await mp(creds, data, optionsGroup);
			l(`\n${u.comma(groupImport.success)} user profiles imported`);
		})());
	}
	
	await Promise.all(tasks);

	const results = { events: eventImport, users: userImport, groups: groupImport };

	if (logs) {
		await u.mkdir(path.resolve("./logs"));
		await u.touch(path.resolve(`./logs/amplitude-import-log-${Date.now()}.json`), results, true);
	}
	l("\n\nfinish\n\n");
	return results;
}

/*
----
TRANSFORMS
----
*/

/**
 * @param  {import('./types.d.ts').CustomTransformOptions} options
 */
function ampEventsToMp(options) {
	const { custom_user_id } = options;

	return function transform(ampEvent) {
		const mixpanelEvent = {
			event: ampEvent.event_type,
			properties: {
				$device_id: ampEvent.device_id || "",
				time: dayjs.utc(ampEvent.event_time).valueOf(),
				$insert_id: ampEvent.$insert_id,
				ip: ampEvent.ip_address,
				$city: ampEvent.city,
				$region: ampEvent.region,
				mp_country_code: ampEvent.country,
				$source: `amplitude-to-mixpanel`
			}
		};

		//canonical id resolution
		if (ampEvent?.user_properties?.[custom_user_id]) mixpanelEvent.properties.$user_id = ampEvent.user_properties[custom_user_id];
		if (ampEvent[custom_user_id]) mixpanelEvent.properties.$user_id = ampEvent[custom_user_id];

		//get all custom props + group props + user props
		mixpanelEvent.properties = { ...ampEvent.event_properties, ...ampEvent.groups, ...ampEvent.user_properties, ...mixpanelEvent.properties };

		//remove what we don't need
		delete ampEvent[custom_user_id];
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
	};
}

/**
 * @param  {import('./types.d.ts').CustomTransformOptions} options
 */
function ampUserToMp(options) {
	const { custom_user_id } = options;

	return function transform(ampEvent) {
		const userProps = ampEvent.user_properties;

		//skip empty props
		if (JSON.stringify(userProps) === "{}") return {};

		let distinct_id;
		//canonical id resolution
		if (ampEvent?.user_properties?.[custom_user_id]) distinct_id = ampEvent.user_properties[custom_user_id];
		if (ampEvent[custom_user_id]) distinct_id = ampEvent[custom_user_id];

		//skip no user_id
		if (!distinct_id) return {};

		const mixpanelProfile = {
			$distinct_id: distinct_id,
			$ip: ampEvent.ip_address,
			$set: userProps
		};

		//include defaults, if they exist
		for (let ampMixPair of ampMixPairs) {
			if (ampEvent[ampMixPair[0]]) {
				mixpanelProfile.$set[ampMixPair[1]] = ampEvent[ampMixPair[0]];
			}
		}

		return mixpanelProfile;
	};
}

/**
 * @param  {import('./types.d.ts').CustomTransformOptions} options
 */
function ampGroupToMp(options) {
	const { custom_user_id } = options;

	return function transform(ampEvent) {
		const groupProps = ampEvent.group_properties;

		//skip empty + no user_id
		if (JSON.stringify(groupProps) === "{}") return {};
		if (!ampEvent.user_id) return {};

		const mixpanelGroup = {
			$group_key: null, //todo
			$group_id: null, //todo
			$set: groupProps
		};

		return mixpanelGroup;
	};
}

/*
----
CLI
----
*/

function cli() {
	const args = yargs(process.argv.splice(2))
		.scriptName("")
		.command("$0", "usage:\nnpx amp-to-mp --dir ./data --token bar --secret qux --project foo ", () => { })
		.option("dir", {
			alias: "file",
			demandOption: true,
			describe: "path to (or file of) UNCOMPRESSED amplitude event json",
			type: "string"
		})
		.option("token", {
			demandOption: true,
			describe: "mp token",
			type: "string"
		})
		.option("secret", {
			demandOption: true,
			describe: "mp secret",
			type: "string"
		})
		.option("project", {
			demandOption: true,
			describe: "mp project id",
			type: "number"
		})
		.option("region", {
			demandOption: false,
			default: "US",
			describe: "US or EU",
			type: "string"
		})
		.option("strict", {
			demandOption: false,
			default: false,
			describe: "baz",
			type: "boolean"
		})
		.option("custom_user_id", {
			demandOption: false,
			default: "user_id",
			describe: "a custom key to use for $user_id instead of amplitude default (user_id)",
			type: "string"
		})
		.option("events", {
			demandOption: false,
			default: true,
			describe: "events",
			type: "boolean"
		})
		.option("users", {
			demandOption: false,
			default: true,
			describe: "user profiles",
			type: "boolean"
		})
		.option("groups", {
			demandOption: false,
			default: false,
			describe: "group profiles",
			type: "boolean"
		})
		.option("verbose", {
			demandOption: false,
			default: true,
			describe: "log messages",
			type: "boolean"
		})
		.option("logs", {
			demandOption: false,
			default: true,
			describe: "write logfile",
			type: "boolean"
		})
		.options("epoch-start", {
			demandOption: false,
			alias: 'epochStart',
			default: 0,
			describe: 'don\'t import data before this timestamp (UNIX EPOCH)',
			type: 'number'
		})
		.options("epoch-end", {
			demandOption: false,
			default: 9991427224,
			alias: 'epochEnd',
			describe: 'don\'t import data after this timestamp (UNIX EPOCH)',
			type: 'number'
		})
		.help().argv;
	/** @type {import('./types.d.ts').Config} */
	return args;
}

/*
----
LOGGING
----
*/

function summarize(data) {
	const summary = data.reduce(
		function (acc, curr, index, array) {
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
		},
		{
			batches: 0,
			duration: 0,
			eps: 0,
			errors: [],
			failed: 0,
			recordType: "",
			requests: 0,
			responses: [],
			retries: 0,
			rps: 0,
			success: 0,
			total: 0
		}
	);
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

const fileExt = ["json", "jsonl", "ndjson"];

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
			process.exit(0);
		})
		.catch(e => {
			console.log(`\n\nuh oh! something didn't work...\nthe error message is:\n\n\t${e.message}\n\n@\n\n${e.stack}\n\n`);
			process.exit(1);
		})
		.finally(() => {
			console.log("\n\nhave a great day!\n\n");
			process.exit(0);
		});
}
