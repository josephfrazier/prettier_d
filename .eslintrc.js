'use strict'

module.exports = {
  env: {
    es6: true,
    node: true,
  },
  extends: ['eslint:recommended'],
  plugins: ['prettier'],
  rules: {
    curly: 'error',
    'no-console': 'off',
    'no-else-return': 'error',
    'no-inner-declarations': 'off',
    'no-var': 'error',
    'prefer-arrow-callback': 'error',
    'prefer-const': 'error',
    'prettier/prettier': [
      'error',
      {
        printWidth: 80,
        tabWidth: 2,
        singleQuote: true,
        trailingComma: 'es5',
        bracketSpacing: true,
        semi: false,
      },
    ],
    strict: 'error',
  },
}
