'use strict'

var fs = require('fs')
var resolve = require('resolve')
var options = require('./options')
var path = require('path')
var unquote = require('unquote')
var configAttendant = require('config-attendant')
var editorconfig = require('editorconfig')
var stringifySorted = require('json-stable-stringify')
var stringifyAligned = require('json-align')

var prettierMap = {}
var filenameMap = {}

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

  var filename = unquote(files[0])

  if (!stdin) {
    text = fs.readFileSync(path.resolve(cwd, filename).trim()).toString()
  }

  return formatText(text, currentOptions, filename, cwd)
}

function formatText(text, currentOptions, filename, cwd) {
  try {
    return prettierFormat(text, currentOptions, filename, cwd)
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
      return sorted.replace(/(.["\d}\]el])$/gm, '$1,')
    } catch (err) {
      if (!currentOptions.fallback) {
        throw err
      }

      return text
    }
  }
}

function prettierFormat(text, currentOptions, filename, cwd) {
  var cwdDeps = getCwdDeps(cwd, currentOptions)
  var filenameDeps = getFilenameDeps(path.join(cwd, filename))

  // TODO merge options better:
  // right now, currentOptions is the result of having cli options override prettier defaults,
  // but the package.json options need to go in the middle:
  // Object.assign({}, __prettier__defaults__, cwdDeps.prettierOptions, __cli__options__)
  var filenameOptions = currentOptions.pkgConf
    ? Object.assign(
        {},
        editorConfigToPrettier(filenameDeps.editorConfig),
        cwdDeps.prettierOptions
      )
    : {}
  var mergedOptions = Object.assign({}, currentOptions, filenameOptions)

  if (mergedOptions.listDifferent) {
    if (!cwdDeps.prettier.check(text, mergedOptions)) {
      // This looks weird, but it's to make sure that we have the right
      // output and exit code
      throw filename
    } else {
      return ''
    }
  } else {
    var indentation = ''
    if (mergedOptions.keepIndentation) {
      indentation = text.match(/^([ \t]*)/)[1]
      var tabSpaces = ' '.repeat(mergedOptions.tabWidth)
      indentation = indentation.replace(/\t/g, tabSpaces)
      var indentationWidth = indentation.length
      mergedOptions.printWidth -= indentationWidth
      if (mergedOptions.useTabs) {
        indentation = indentation.replace(RegExp(tabSpaces, 'g'), '\t')
      }
    }

    var report = cwdDeps.prettier.format(text, mergedOptions)

    if (mergedOptions.keepIndentation) {
      report = report.replace(/^(.)/gm, indentation + '$1')
    }

    if (mergedOptions.write) {
      if (report !== text) {
        fs.writeFileSync(filename, report, 'utf8')
      }

      report = ''
    }

    return report
  }
}

function getCwdDeps(cwd, currentOptions) {
  var cwdDeps = prettierMap[cwd]

  if (!cwdDeps) {
    var prettierPath
    var usePrettierEslint = currentOptions.usePrettierEslint === true;
    if (usePrettierEslint) {
      try {
        prettierPath = resolve.sync('prettier-eslint', {basedir: cwd})
      } catch (e) {
        try {
          prettierPath = resolve.sync('prettier-eslint')
        } catch (e) {
          //throw Error(`No prettier-eslint1 found from ${cwd}`)
          // module not found, fall back to prettier
          usePrettierEslint = false
        }
      }
    }

    if (!usePrettierEslint) {
      try {
        prettierPath = resolve.sync('prettier', {basedir: cwd})
      } catch (e) {
        if (currentOptions.localOnly) {
          throw Error(`No prettier found from ${cwd}`)
        }
        // module not found
        prettierPath = resolve.sync('prettier')
      }
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

function getFilenameDeps(filename) {
  var filenameDeps = filenameMap[filename]

  if (!filenameDeps) {
    filenameDeps = filenameMap[filename] = {
      editorConfig: editorconfig.parseSync(filename),
    }
  }

  return filenameDeps
}

function editorConfigToPrettier(editorConfig) {
  const result = {}
  result.useTabs = editorConfig.indent_style === 'tab' || result.useTabs
  result.tabWidth = editorConfig.tab_width || result.tabWidth
  result.printWidth = editorConfig.max_line_length || result.printWidth
  return result
}
