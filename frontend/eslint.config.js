const typescript = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        navigator: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    },
    rules: {
      // Disable SLDS utility class suggestions and rules
      'slds/no-utility-classes': 'off',
      'slds/utility-classes': 'off',
      '@salesforce/slds-linting': 'off'
    },
    settings: {
      // Disable SLDS-related settings
      'slds': false
    }
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'coverage/',
      '*.d.ts',
      '*.min.js',
      'config.js',
      'config.example.js',
      'scripts/deploy.js',
      '**/*.config.js',
      '**/*.config.ts',
      'vite.config.ts'
    ]
  }
]; 