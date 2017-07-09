'use strict'

const fs = require('fs')
const resolve = require('resolve')
const options = require('./options')
const path = require('path')
const unquote = require('unquote')
const configAttendant = require('config-attendant')
const editorconfig = require('editorconfig')
const toFlags = require('to-flags')
const stream = require('stream')
const stringToStream = require('string-to-stream')

const prettierMap = {}
const filenameMap = {}

module.exports = function(cwd, args, text) {
  process.chdir(cwd)

  let currentOptions

  try {
    currentOptions = options.parse(args)
  } catch (e) {
    return e.message + '\n# exit 1'
  }

  const files = currentOptions._
  const stdin = currentOptions.stdin

  if (!files.length && (!stdin || typeof text !== 'string')) {
    return options.generateHelp() + '\n'
  }

  const filename = unquote(files[0])

  if (!stdin) {
    text = fs.readFileSync(path.resolve(cwd, filename).trim()).toString()
  }

  return prettierFormat(text, currentOptions, filename, cwd)
}

function prettierFormat(text, currentOptions, filename, cwd) {
  const cwdDeps = getCwdDeps(cwd, currentOptions)
  const filenameDeps = getFilenameDeps(path.join(cwd, filename))

  // TODO merge options better:
  // right now, currentOptions is the result of having cli options override prettier defaults,
  // but the package.json options need to go in the middle:
  // Object.assign({}, __prettier__defaults__, cwdDeps.prettierOptions, __cli__options__)
  const filenameOptions = currentOptions.pkgConf
    ? Object.assign(
        {},
        editorConfigToPrettier(filenameDeps.editorConfig),
        cwdDeps.prettierOptions
      )
    : {}
  const mergedOptions = Object.assign({}, currentOptions, filenameOptions)

  const mergedFlags = toFlags(mergedOptions)

  const stdin = stringToStream(text)

  let output = ''
  const stdout = new stream.Writable({
    write: function(chunk, encoding, next) {
      output += chunk.toString()
      next()
    },
  })

  let errput = ''
  const stderr = new stream.Writable({
    write: function(chunk, encoding, next) {
      errput += chunk.toString()
      next()
    },
  })

  return require('prettier/bin/prettier')
    .cli(mergedFlags, stdin, stdout, stderr, cwdDeps.prettier)
    .then(result => {
      if (result.exitCode != 0) {
        throw errput
      }
      return output
    })
}

function getCwdDeps(cwd, currentOptions) {
  let cwdDeps = prettierMap[cwd]

  if (!cwdDeps) {
    let prettierPath

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

function getFilenameDeps(filename) {
  let filenameDeps = filenameMap[filename]

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
