module.exports = {
  'extends': [
    'standard',
    'prettier',
  ],
  'plugins': [
    'standard',
    'promise',
    'prettier'
  ],
  rules: {
    'standard/no-callback-literal': 0,
    'prettier/prettier': ['error', {
      printWidth: 80,
      tabWidth: 2,
      singleQuote: true,
      trailingComma: 'es5',
      bracketSpacing: true,
      semi: false,
    }]
  }
}
