module.exports = {
  extends: [
    'stylelint-config-standard',
    'stylelint-config-recess-order'
  ],
  rules: {
    // Layout-specific rules to prevent the issues we encountered
    'declaration-property-value-no-unknown': true,
    'property-no-unknown': true,
    
    // Box model consistency rules
    'declaration-block-no-duplicate-properties': [
      true,
      {
        ignore: ['consecutive-duplicates-with-different-values']
      }
    ],
    
    // Specificity management
    'selector-max-specificity': '0,4,0',
    'selector-max-compound-selectors': 4,
    'selector-max-id': 0,
    
    // Layout container rules
    'custom-property-pattern': '^([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
    
    // Responsive design rules
    'media-query-no-invalid': true,
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['tailwind', 'apply', 'variants', 'responsive', 'screen']
      }
    ],
    
    // Performance rules
    'no-duplicate-selectors': true,
    'declaration-block-no-redundant-longhand-properties': true,
    
    // Layout debugging helpers
    'comment-pattern': '^(?:(?:TODO|FIXME|NOTE|HACK|XXX):|Layout:|Box Model:|Specificity:)',
    
    // Disable rules that might conflict with our current CSS
    'no-descending-specificity': null,
    'selector-class-pattern': null,
    'value-keyword-case': ['lower', { ignoreKeywords: ['inherit', 'initial', 'unset'] }],
    
    // Allow vendor prefixes for cross-browser compatibility
    'property-no-vendor-prefix': null,
    'value-no-vendor-prefix': null
  },
  
  // Custom rules for layout containers
  overrides: [
    {
      files: ['**/*.css'],
      customSyntax: 'postcss',
      rules: {
        // Enforce box-sizing on layout containers
        'declaration-property-value-allowed-list': {
          'box-sizing': ['border-box', 'content-box'],
        }
      }
    }
  ],
  
  ignoreFiles: [
    'node_modules/**/*',
    'dist/**/*',
    'build/**/*',
    'coverage/**/*'
  ]
}; 