'use strict'

var minimist = require('minimist')
var camelcaseKeys = require('camelcase-keys')

module.exports.generateHelp = function() {
  var cp = require('child_process')
  var path = require('path')

  var prettierPath = path.resolve(__dirname, '../node_modules/.bin/prettier')
  var prettierHelpCommand = [
    prettierPath,
    '--help',
    '| sed "s/Usage: prettier/Usage: prettier_d/"',
    '| sed "s/filename .../filename/"',
    '| grep -v -- --color',
  ].join(' ')
  var prettierHelp = cp.execSync(prettierHelpCommand).toString()

  var prettierDHelp = [
    'Options specific to prettier_d:',
    '  --fallback               If formatting fails, print the original input. Defaults to false.',
    '  --json                   Try to parse input as JSON and format with json-stable-stringify and json-align. Defaults to false.',
  ].join('\n')

  return [prettierHelp, prettierDHelp].join('\n')
}

module.exports.parse = function(argv) {
  // copied from
  // https://github.com/prettier/prettier/blob/793db31/bin/prettier.js#L13-L44
  // TODO see if prettier will expose this so we don't have to copy/paste
  var parsed = minimist(argv.slice(2), {
    boolean: [
      // prettier_d options
      'fallback',
      'json',

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
