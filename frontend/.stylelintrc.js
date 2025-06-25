module.exports = {
  extends: [],
  plugins: [],
  rules: {
    // Disable SLDS utility class suggestions
    'plugin/no-unsupported-browser-features': null,
    'no-descending-specificity': null,
    'declaration-block-trailing-semicolon': null,
    'at-rule-no-unknown': null,
    // Disable any SLDS-specific rules
    'slds/no-utility-classes': 'off',
    'slds/utility-classes': 'off'
  },
  ignoreFiles: [
    'node_modules/**/*',
    'dist/**/*'
  ]
}; 