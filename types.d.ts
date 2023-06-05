/**
 * an object to store configuration params
 */
interface Config {
    /**
     * a directory containing UNCOMPRESSED amplitude event json
     */
    dir: string;
    /**
     * mixpanel secret
     */
    secret: string;
    /**
     * mixpanel project id
     */
    project: number;
    /**
     * mixpanel token
     */
    token: string;
    /**
     * use strict mode?
     */
    strict?: boolean;
	/**
	 * a custom key to use for $user_id instead of amplitude default (user_id)
	 * see //? https://www.docs.developers.amplitude.com/analytics/apis/export-api/
	 */
	custom_user_id?: string;
    /**
     * US or EU residency
     */
    region?: "US" | "EU" | undefined;
    /**
     * group keys (if applicable)
     */
    group_keys?: string[];
    /**
     * verbosely log to the console
     */
    verbose: boolean;
    /**
     * write logs to file
     */
    logs: boolean;
    /**
     * send events
     */
    events?: boolean;
    /**
     * send users
     */
    users?: boolean;
    /**
     * send groups
     */
    groups?: boolean;
    [x: string]: unknown;
}


interface CustomTransformOptions {
	/**
	 * a custom key to use for $user_id instead of amplitude default (user_id)
	 * see //? https://www.docs.developers.amplitude.com/analytics/apis/export-api/
	 */
	custom_user_id?: string;
}