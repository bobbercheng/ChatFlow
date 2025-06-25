module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: [],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: [],
  rules: {
    // Disable SLDS utility class suggestions and rules
    'slds/no-utility-classes': 'off',
    'slds/utility-classes': 'off',
    '@salesforce/slds-linting': 'off'
  },
  settings: {
    // Disable SLDS-related settings
    'slds': false
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '*.d.ts'
  ]
}; 