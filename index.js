#! /usr/bin/env node

// @ts-check
import u from "ak-tools";
import esMain from 'es-main';
import yargs from "yargs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
dayjs.extend(utc);
import mp from 'mixpanel-import';
import path from 'path';


let log = ``;



/**
 * do stuff
 * @param  {Config} config 
 */
async function main(config) {
	const { project, dir, secret, token, strict, region } = config;

	/** @type {import('./node_modules/mixpanel-import/types.js').Options} */

	const optionsEvents = {
		abridged: true,
		recordType: 'event',
		removeNulls: true,
		region,
		strict,
		streamFormat: "jsonl",
		fixData: false,
		logs: false,
		forceStream: true,
		workers: 25,
		verbose: false,
		//@ts-ignore
		transformFunc: ampEventsToMp
	};

	/** @type {import('./node_modules/mixpanel-import/types.js').Options} */

	const optionsUsers = {
		abridged: true,
		recordType: 'user',
		removeNulls: true,
		region,
		strict,
		streamFormat: "jsonl",
		fixData: true,
		logs: false,
		forceStream: true,
		workers: 25,
		verbose: false,
		//@ts-ignore
		transformFunc: ampUserToMp,

	};


	/** @type {import('./node_modules/mixpanel-import/types.js').Creds} */
	//@ts-ignore
	const creds = {
		secret,
		token,
		project,

	};
	const events = [];
	const users = [];
	const files = (await u.ls(path.resolve(dir))).filter(f => f.endsWith('json'));
	let eventCount = 0
	let userCount = 0

	for (const file of files) {
		const data = (await u.load(file)).trim()
		const evImport = await mp(creds, data, optionsEvents);
		events.push(evImport);
		eventCount += evImport.success
		const usImport = await mp(creds, data, optionsUsers);
		users.push(usImport);
		userCount = usImport.success
		u.progress(`events: ${u.comma(eventCount)} | users: ${u.comma(userCount)}`, "", "")
	}

	const results = { events, users };
	await u.mkdir(path.resolve('./logs'));
	await u.touch(path.resolve('./logs/amplitude-import-log.json'), results, true);

	return results;

}

function ampEventsToMp(ampEvent) {
	const mixpanelEvent = {
		"event": ampEvent.event_type,
		"properties": {
			//prefer user_id, then device_id, then amplitude_id
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

export default main;

/**
 * @returns {Config}
 */
function cli() {
	const args = yargs(process.argv.splice(2))
		.scriptName("")
		.command('$0', '', () => { })
		.option("dir", {
			demandOption: true,
			describe: 'path to files',
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
		.option("strict", {
			demandOption: false,
			default: false,
			describe: 'baz',
			type: 'boolean'
		})
		.option("region", {
			demandOption: false,
			default: 'US',
			describe: 'US or EU',
			type: 'string'
		})
		.help()
		.argv;
	//@ts-ignore
	return args;
}


function l(data) {
	log += `${data}\n`;
	console.log(data);
}

if (esMain(import.meta)) {
	const params = cli();

	main(params)
		.then(() => {
			//noop
		}).catch((e) => {
			l(`\nuh oh! something didn't work...\nthe error message is:\n\n\t${e.message}\n\n`);

		}).finally(() => {
			l('\n\nhave a great day!\n\n');
			process.exit(0);
		});

}

//mapping amp default to mp defaults
//https://developers.amplitude.com/docs/identify-api
//https://help.mixpanel.com/hc/en-us/articles/115004613766-Default-Properties-Collected-by-Mixpanel
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