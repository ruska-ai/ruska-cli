/**
 * Example: Prompt Templates
 *
 * Demonstrates creating versioned prompt templates, variable extraction,
 * rendering with substitution, and missing-variable validation.
 *
 * Run: npx tsx source/core/examples/02-prompts.ts
 */

import {createPromptTemplate, renderPrompt, renderTemplate} from '../prompt.js';

function main() {
	// --- 1. Simple string substitution ---
	const rendered = renderPrompt(
		'Hello {{name}}, welcome to {{project}}!',
		{name: 'Alice', project: 'Ruska'},
	);
	console.log('Simple render:', rendered);
	// => "Hello Alice, welcome to Ruska!"

	// --- 2. Create a versioned template ---
	const template = createPromptTemplate(
		'coding-assistant',
		'1.0',
		'You are a {{language}} expert working on {{project}}. Focus on {{task}}.',
	);

	console.log('Template name:', template.name);
	console.log('Template version:', template.version);
	console.log('Detected variables:', template.variables);
	// => ['language', 'project', 'task']

	// --- 3. Render the template with all variables ---
	const systemPrompt = renderTemplate(template, {
		language: 'TypeScript',
		project: 'ruska-cli',
		task: 'implementing the agent core',
	});
	console.log('System prompt:', systemPrompt);

	// --- 4. Missing variable throws a descriptive error ---
	try {
		renderTemplate(template, {
			language: 'TypeScript',
			// Missing: project, task
		});
	} catch (error) {
		console.log('Missing vars error:', (error as Error).message);
		// => "Missing required template variables: project, task"
	}

	// --- 5. Unmatched variables in renderPrompt are left as-is ---
	const partial = renderPrompt('Hello {{name}}, your role is {{role}}', {
		name: 'Bob',
	});
	console.log('Partial render:', partial);
	// => "Hello Bob, your role is {{role}}"
}

main();
