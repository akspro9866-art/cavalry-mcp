import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Flat ESLint 9 config, kept consistent with stallion's eslint.config.mjs. */
export default tseslint.config(
	{
		ignores: [
			'dist/**',
			'node_modules/**',
			'.cloned-renders/**',
			'tmp-live-*',
			// Agent skills are byte-identical vendored copies (see skill-parity.mjs);
			// linting them would demand edits that parity forbids.
			'.qoder/skills/**',
			'.agents/skills/**',
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				...globals.node,
				// Cavalry's script globals are injected by the host.
				api: 'readonly',
				ui: 'readonly',
				cavalry: 'readonly',
			},
		},
		rules: {
			'no-const-assign': 'warn',
			'no-this-before-super': 'warn',
			'no-undef': 'warn',
			'no-unreachable': 'warn',
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-require-imports': 'off',
			'@typescript-eslint/no-unused-expressions': 'warn',
			'constructor-super': 'warn',
			'valid-typeof': 'warn',
		},
	},
	{
		files: ['**/*.ts'],
		rules: {
			// TypeScript already resolves identifiers and types.
			'no-undef': 'off',
		},
	},
	{
		files: ['types/**/*.d.ts'],
		rules: {
			'@typescript-eslint/triple-slash-reference': 'off',
		},
	},
)