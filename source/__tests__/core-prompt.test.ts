import test from 'ava';
import {
	renderPrompt,
	createPromptTemplate,
	renderTemplate,
} from '../core/prompt.js';
import {promptTemplateSchema} from '../core/schemas.js';

// ---------------------------------------------------------------------------
// renderPrompt — basic substitution
// ---------------------------------------------------------------------------

test('renderPrompt: substitutes a single variable', t => {
	const result = renderPrompt('Hello, {{name}}!', {name: 'Alice'});
	t.is(result, 'Hello, Alice!');
});

test('renderPrompt: substitutes multiple variables', t => {
	const result = renderPrompt('{{greeting}}, {{name}}!', {
		greeting: 'Hi',
		name: 'Bob',
	});
	t.is(result, 'Hi, Bob!');
});

test('renderPrompt: substitutes same variable used multiple times', t => {
	const result = renderPrompt('{{x}} + {{x}} = 2{{x}}', {x: '3'});
	t.is(result, '3 + 3 = 23');
});

test('renderPrompt: returns template unchanged when no variables present', t => {
	const result = renderPrompt('No variables here.', {});
	t.is(result, 'No variables here.');
});

test('renderPrompt: leaves unmatched variables intact', t => {
	const result = renderPrompt('{{known}} and {{unknown}}', {known: 'yes'});
	t.is(result, 'yes and {{unknown}}');
});

test('renderPrompt: handles empty variables object', t => {
	const result = renderPrompt('{{a}} {{b}}', {});
	t.is(result, '{{a}} {{b}}');
});

test('renderPrompt: handles empty template string', t => {
	const result = renderPrompt('', {name: 'Alice'});
	t.is(result, '');
});

// ---------------------------------------------------------------------------
// createPromptTemplate — template creation
// ---------------------------------------------------------------------------

test('createPromptTemplate: creates template with extracted variables', t => {
	const tmpl = createPromptTemplate(
		'greeting',
		'1.0',
		'Hello, {{name}}! You are a {{role}}.',
	);
	t.is(tmpl.name, 'greeting');
	t.is(tmpl.version, '1.0');
	t.is(tmpl.template, 'Hello, {{name}}! You are a {{role}}.');
	t.deepEqual(tmpl.variables, ['name', 'role']);
});

test('createPromptTemplate: deduplicates repeated variables', t => {
	const tmpl = createPromptTemplate('repeat', '1.0', '{{x}} and {{x}} again');
	t.deepEqual(tmpl.variables, ['x']);
});

test('createPromptTemplate: returns empty variables for template without placeholders', t => {
	const tmpl = createPromptTemplate('static', '1.0', 'No placeholders.');
	t.deepEqual(tmpl.variables, []);
});

test('createPromptTemplate: output validates against promptTemplateSchema', t => {
	const tmpl = createPromptTemplate(
		'test',
		'2.0',
		'Answer {{question}} about {{topic}}.',
	);
	const parsed = promptTemplateSchema.safeParse(tmpl);
	t.true(parsed.success);
});

// ---------------------------------------------------------------------------
// renderTemplate — validated rendering
// ---------------------------------------------------------------------------

test('renderTemplate: renders when all variables provided', t => {
	const tmpl = createPromptTemplate('greet', '1.0', 'Hello, {{name}}!');
	const result = renderTemplate(tmpl, {name: 'World'});
	t.is(result, 'Hello, World!');
});

test('renderTemplate: renders with multiple variables', t => {
	const tmpl = createPromptTemplate(
		'intro',
		'1.0',
		'I am {{name}}, a {{role}}.',
	);
	const result = renderTemplate(tmpl, {name: 'Agent', role: 'assistant'});
	t.is(result, 'I am Agent, a assistant.');
});

test('renderTemplate: throws on missing single variable', t => {
	const tmpl = createPromptTemplate('greet', '1.0', 'Hello, {{name}}!');
	const error = t.throws(() => renderTemplate(tmpl, {}));
	t.truthy(error);
	t.true(error!.message.includes('name'));
	t.true(error!.message.includes('Missing required template variables'));
});

test('renderTemplate: throws listing all missing variables', t => {
	const tmpl = createPromptTemplate('multi', '1.0', '{{a}} {{b}} {{c}}');
	const error = t.throws(() => renderTemplate(tmpl, {b: 'has-b'}));
	t.truthy(error);
	t.true(error!.message.includes('a'));
	t.true(error!.message.includes('c'));
	t.false(error!.message.includes(', b'));
});

test('renderTemplate: allows extra variables beyond what template needs', t => {
	const tmpl = createPromptTemplate('simple', '1.0', 'Hello, {{name}}!');
	const result = renderTemplate(tmpl, {name: 'Alice', extra: 'ignored'});
	t.is(result, 'Hello, Alice!');
});

test('renderTemplate: renders template with no variables and empty object', t => {
	const tmpl = createPromptTemplate('static', '1.0', 'Static text.');
	const result = renderTemplate(tmpl, {});
	t.is(result, 'Static text.');
});
