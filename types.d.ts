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
    strict: boolean;
    /**
     * US or EU residency
     */
    region: "US" | "EU" | undefined;
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
	[x: string]: unknown
}
