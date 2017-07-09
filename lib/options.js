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
  ].join('\n')

  return prettierHelp + prettierDHelp
}

module.exports.parse = function(argv) {
  const opts = Object.assign(
    {},
    require('prettier/bin/prettier').minimistOpts(() => {})
  )
  opts.boolean = opts.boolean.concat('json', 'local-only', 'pkg-conf')
  const parsed = minimist(argv, opts)
  return camelcaseKeys(parsed)
}
