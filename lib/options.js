'use strict';

var minimist = require('minimist');
var camelcaseKeys = require('camelcase-keys');

module.exports.generateHelp = function () {
  return 'See https://github.com/prettier/prettier#cli';
};

module.exports.parse = function (argv) {
  // copied from
  // https://github.com/prettier/prettier/blob/793db31/bin/prettier.js#L13-L44
  // TODO see if prettier will expose this so we don't have to copy/paste
  var parsed = minimist(argv.slice(2), {
    boolean: [
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
      'flow-parser'
    ],
    string: ['print-width', 'tab-width', 'parser', 'trailing-comma'],
    default: {
      semi: true,
      color: true,
      'bracket-spacing': true,
      parser: 'babylon'
    },
    alias: { help: 'h', version: 'v', 'list-different': 'l' },
    unknown: function (param) {
      if (param.startsWith('-')) {
        console.warn('Ignored unknown option: ' + param + '\n');
        return false;
      }
      return true;
    }
  });
  return camelcaseKeys(parsed);
};
