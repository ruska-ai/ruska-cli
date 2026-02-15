import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const permissionDeniedCodes = new Set(['EACCES', 'EPERM', 'EROFS']);
const trackedHooksPath = '.githooks';
const trackedPreCommitPath = path.join(process.cwd(), trackedHooksPath, 'pre-commit');

const getErrorCode = error => {
	if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
		return error.code;
	}

	return null;
};

const getErrorStatus = error => {
	if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
		return error.status;
	}

	return null;
};

const getErrorStderr = error => {
	if (error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string') {
		return error.stderr;
	}

	return '';
};

const isPermissionError = error => {
	if (permissionDeniedCodes.has(getErrorCode(error))) {
		return true;
	}

	const stderr = getErrorStderr(error).toLowerCase();
	return stderr.includes('permission denied') || stderr.includes('could not lock config file');
};

const runGit = arguments_ =>
	childProcess.execFileSync('git', arguments_, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});

const ensureTrackedHookIsExecutable = () => {
	if (!fs.existsSync(trackedPreCommitPath)) {
		console.warn(`Skipping git hook setup because ${trackedHooksPath}/pre-commit is missing.`);
		return false;
	}

	try {
		fs.chmodSync(trackedPreCommitPath, 0o755);
		return true;
	} catch (error) {
		if (isPermissionError(error)) {
			console.warn(`Skipping git hook chmod due to permission restrictions: ${trackedPreCommitPath}`);
			return false;
		}

		throw error;
	}
};

const readCurrentHooksPath = () => {
	try {
		return runGit(['config', '--local', '--get', 'core.hooksPath']).trim();
	} catch (error) {
		if (getErrorStatus(error) === 1) {
			return '';
		}

		if (isPermissionError(error)) {
			console.warn('Skipping core.hooksPath setup due to permission restrictions.');
			return null;
		}

		throw error;
	}
};

const setHooksPath = hooksPath => {
	try {
		runGit(['config', '--local', 'core.hooksPath', hooksPath]);
	} catch (error) {
		if (isPermissionError(error)) {
			console.warn('Skipping core.hooksPath setup due to permission restrictions.');
			return false;
		}

		throw error;
	}

	return true;
};

const configureHooksPath = () => {
	const currentHooksPath = readCurrentHooksPath();

	if (currentHooksPath === null) {
		return;
	}

	if (currentHooksPath === trackedHooksPath) {
		return;
	}

	if (currentHooksPath && currentHooksPath !== trackedHooksPath) {
		console.warn(
			`Skipping core.hooksPath update because it is already set to "${currentHooksPath}".`,
		);
		return;
	}

	setHooksPath(trackedHooksPath);
};

const main = () => {
	const isTrackedHookReady = ensureTrackedHookIsExecutable();

	if (!isTrackedHookReady) {
		return;
	}

	configureHooksPath();
};

main();
