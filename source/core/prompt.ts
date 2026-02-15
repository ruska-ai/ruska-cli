/**
 * Prompt manager — prompt-as-code with variable substitution.
 * Pure functions for creating, validating, and rendering prompt templates.
 */

import {type PromptTemplate} from './schemas.js';

/**
 * Extract variable names from a template string.
 * Variables are enclosed in double curly braces: {{variableName}}
 */
function extractVariables(template: string): string[] {
	const matches = template.matchAll(/{{(\w+)}}/g);
	const names = new Set<string>();
	for (const match of matches) {
		names.add(match[1]!);
	}

	return [...names];
}

/**
 * Perform {{variable}} substitution on a raw template string.
 * All occurrences of {{key}} are replaced with the corresponding value.
 */
export function renderPrompt(
	template: string,
	variables: Record<string, string>,
): string {
	// eslint-disable-next-line unicorn/prefer-string-replace-all
	return template.replace(/{{(\w+)}}/g, (_match: string, key: string) =>
		key in variables ? variables[key]! : `{{${key}}}`,
	);
}

/**
 * Create a PromptTemplate by extracting variable names from the template string.
 */
export function createPromptTemplate(
	name: string,
	version: string,
	template: string,
): PromptTemplate {
	return {
		name,
		version,
		template,
		variables: extractVariables(template),
	};
}

/**
 * Render a PromptTemplate, validating that all required variables are provided.
 * Throws a descriptive error if any required variable is missing.
 */
export function renderTemplate(
	promptTemplate: PromptTemplate,
	variables: Record<string, string>,
): string {
	const missing = promptTemplate.variables.filter(
		(v) => !(v in variables),
	);

	if (missing.length > 0) {
		throw new Error(
			`Missing required template variables: ${missing.join(', ')}`,
		);
	}

	return renderPrompt(promptTemplate.template, variables);
}
