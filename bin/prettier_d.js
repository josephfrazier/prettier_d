#!/usr/bin/env node
'use strict';

function start() {
  require('../lib/launcher')();
}

var cmd = process.argv[2];
if (cmd === 'start') {

  start();

} else if (cmd === '-v' || cmd === '--version') {

  console.log('v%s (prettier_d v%s)',
    require('prettier/package.json').version,
    require('../package.json').version);

} else if (cmd === '-h' || cmd === '--help') {

  var cp = require('child_process');
  var path = require('path');

  var prettierPath = path.resolve(__dirname, '../node_modules/.bin/prettier');
  var prettierHelp = cp.execFileSync(prettierPath, ['--help']).toString();

  console.log(prettierHelp.replace('prettier', 'prettier_d'));

} else {

  var client = require('../lib/client');
  if (cmd === 'restart') {
    client.stop(function () {
      process.nextTick(start);
    });
  } else {
    var commands = ['stop', 'status', 'restart'];
    if (commands.indexOf(cmd) === -1) {
      var useStdIn = (process.argv.indexOf('--stdin') > -1);
      var args = process.argv.slice(2);

      if (!require('supports-color')) {
        args.unshift('--no-color');
      }

      if (useStdIn) {
        var text = '';
        process.stdin.setEncoding('utf8');

        process.stdin.on('data', function (chunk) {
          text += chunk;
        });

        process.stdin.on('end', function () {
          client.lint(args, text);
        });
      } else {
        client.lint(args);
      }
    } else {
      client[cmd](process.argv.slice(3));
    }
  }

}
