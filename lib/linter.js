'use strict'

var fs = require('fs')
var resolve = require('resolve')
var options = require('./options')
var path = require('path')
var unquote = require('unquote')
var configAttendant = require('config-attendant')
var stringifySorted = require('json-stable-stringify')
var stringifyAligned = require('json-align')

var prettierMap = {}

module.exports = function(cwd, args, text) {
  process.chdir(cwd)
  var currentOptions
  try {
    currentOptions = options.parse([0, 0].concat(args))
  } catch (e) {
    return e.message + '\n# exit 1'
  }
  var files = currentOptions._
  var stdin = currentOptions.stdin
  if (!files.length && (!stdin || typeof text !== 'string')) {
    return options.generateHelp() + '\n'
  }
  var report
  var filename = unquote(files[0])
  if (!stdin) {
    text = fs.readFileSync(path.resolve(cwd, filename).trim()).toString()
  }
  try {
    var cwdDeps = getCwdDeps(cwd, currentOptions)

    // TODO merge options better:
    // right now, currentOptions is the result of having cli options override prettier defaults,
    // but the package.json options need to go in the middle:
    // Object.assign({}, __prettier__defaults__, cwdDeps.prettierOptions, __cli__options__)
    var mergedOptions = Object.assign(
      {},
      currentOptions,
      currentOptions.pkgConf ? cwdDeps.prettierOptions : {}
    )

    if (currentOptions.listDifferent) {
      if (!cwdDeps.prettier.check(text, mergedOptions)) {
        // This looks weird, but it's to make sure that we have the right
        // output and exit code
        throw filename
      } else {
        report = ''
      }
    } else {
      report = cwdDeps.prettier.format(text, mergedOptions)
      if (currentOptions.write) {
        if (report !== text) {
          fs.writeFileSync(filename, report, 'utf8')
        }
        report = ''
      }
    }
  } catch (err) {
    // try to format JSON files
    // prettier doesn't do this currently:
    // https://github.com/prettier/prettier/issues/322
    try {
      if (!currentOptions.json) {
        throw err
      }
      var sorted = stringifyAligned(
        JSON.parse(stringifySorted(JSON.parse(text))),
        null,
        currentOptions.tabWidth,
        true
      )
      // Put a comma after strings, numbers, objects, arrays, `true`, `false`,
      // or `null` at the end of a line. See the grammar at http://json.org/
      report = sorted.replace(/(.["\d}\]el])$/gm, '$1,')
    } catch (err) {
      if (!currentOptions.fallback) {
        throw err
      }
      report = text
    }
  }
  return report
}

function getCwdDeps(cwd, currentOptions) {
  var cwdDeps = prettierMap[cwd]
  if (!cwdDeps) {
    var prettierPath
    try {
      prettierPath = resolve.sync('prettier', { basedir: cwd })
    } catch (e) {
      if (currentOptions.localOnly) {
        throw Error(`No prettier found from ${cwd}`)
      }
      // module not found
      prettierPath = resolve.sync('prettier')
    }
    cwdDeps = prettierMap[cwd] = {
      prettier: require(prettierPath),
      // The empty objects are:
      // 1. The defaults object (omitted since those are included in currentOptions)
      // 2. The argv object to override what minimist might think it has (because this is the server)
      prettierOptions: configAttendant('prettier', {}, {}),
    }
  }
  return cwdDeps
}
