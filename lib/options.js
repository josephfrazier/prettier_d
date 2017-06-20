'use strict'

const minimist = require('minimist')
const camelcaseKeys = require('camelcase-keys')

module.exports.generateHelp = function() {
  const cp = require('child_process')
  const path = require('path')

  const prettierPath = path.resolve(__dirname, '../node_modules/.bin/prettier')
  const prettierHelpCommand = [
    prettierPath,
    '--help',
    '| sed "s/Usage: prettier/Usage: prettier_d/"',
    '| sed "s/filename .../filename/"',
    '| grep -v -- --color',
  ].join(' ')
  const prettierHelp = cp.execSync(prettierHelpCommand).toString()

  const prettierDHelp = [
    'Options specific to prettier_d:',
    '  --fallback               If formatting fails, print the original input. Defaults to false.',
    '  --json                   Try to parse input as JSON and format with json-stable-stringify and json-align. Defaults to false.',
    '  --local-only             Fail if prettier is not in ./node_modules. Defaults to false.',
    '                           If --json is specified, it will still be formatted.',
    '                           If --fallback is specified, the original input will be printed.',
    '  --pkg-conf               Read prettier configuration from nearest package.json/.prettierrc/.editorconfig to working directory.',
    '                           If a .prettierrc file is found, it will override package.json.',
    '                           Both .prettierrc and package.json override .editorconfig.',
    '                           NOTE: CLI options pertaining to formatting will be ignored.',
    '  --keep-indentation       Keep input indentation (read from first line).',
    '                           NOTE: This will mangle multiline literals (e.g. template strings).',
    '                           NOTE: This does not work with JSON.',
  ].join('\n')

  return prettierHelp + prettierDHelp
}

module.exports.parse = function(argv) {
  // copied from
  // https://github.com/prettier/prettier/blob/793db31/bin/prettier.js#L13-L44
  // TODO see if prettier will expose this so we don't have to copy/paste
  const parsed = minimist(argv.slice(2), {
    boolean: [
      // prettier_d options
      'fallback',
      'json',
      'local-only',
      'pkg-conf',
      'keep-indentation',

      // prettier options
      'write',
      'stdin',
      'use-tabs',
      'semi',
      'single-quote',
      'bracket-spacing',
      'jsx-bracket-same-line',
      // The supports-color package (a sub sub dependency) looks directly at
      // `process.argv` for `--no-color` and such-like options. The reason it is
      // listed here is to avoid "Ignored unknown option: --no-color" warnings.
      // See https://github.com/chalk/supports-color/#info for more information.
      'color',
      'list-different',
      'help',
      'version',
      'debug-print-doc',
      'debug-check',
      // Deprecated in 0.0.10
      'flow-parser',
    ],
    string: ['parser', 'trailing-comma'],
    default: {
      semi: true,
      color: true,
      'bracket-spacing': true,
      parser: 'babylon',
    },
    alias: { help: 'h', version: 'v', 'list-different': 'l' },
  })
  return camelcaseKeys(parsed)
}
