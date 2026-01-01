import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {type Config} from '../types/index.js';

/**
 * Get the path to the ruska config directory
 */
export function getConfigDir(): string {
	return path.join(os.homedir(), '.ruska');
}

/**
 * Get the path to the auth config file
 */
export function getConfigPath(): string {
	return path.join(getConfigDir(), 'auth.json');
}

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir(): Promise<void> {
	const configDir = getConfigDir();
	try {
		await fs.mkdir(configDir, {recursive: true});
	} catch (error: unknown) {
		// Directory already exists or other error
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
			throw error;
		}
	}
}

/**
 * Load config from ~/.ruska/auth.json
 * Returns undefined if config doesn't exist or is invalid
 */
export async function loadConfig(): Promise<Config | undefined> {
	try {
		const configPath = getConfigPath();
		const data = await fs.readFile(configPath, 'utf8');
		const config = JSON.parse(data) as Config;

		// Validate required fields
		if (!config.apiKey || !config.host) {
			return undefined;
		}

		return config;
	} catch {
		// File doesn't exist or is invalid JSON
		return undefined;
	}
}

/**
 * Save config to ~/.ruska/auth.json
 */
export async function saveConfig(config: Config): Promise<void> {
	await ensureConfigDir();
	const configPath = getConfigPath();
	await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Delete the config file
 */
export async function clearConfig(): Promise<void> {
	try {
		const configPath = getConfigPath();
		await fs.unlink(configPath);
	} catch {
		// File doesn't exist, ignore
	}
}

/**
 * Check if config exists and is valid
 */
export async function isAuthenticated(): Promise<boolean> {
	const config = await loadConfig();
	return config !== undefined;
}
