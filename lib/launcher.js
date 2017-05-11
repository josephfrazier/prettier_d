'use strict'

var connect = require('./client').connect

function check(callback) {
  connect(function(err, socket, token) {
    if (socket) socket.end()
    callback(err, socket, token)
  })
}

function wait(callback) {
  check(function(err) {
    if (!err) {
      if (typeof callback === 'function') {
        callback(null)
      }
    } else {
      setTimeout(function() {
        wait(callback)
      }, 100)
    }
  })
}

function launch(callback) {
  var spawn = require('child_process').spawn
  var server = require.resolve('../lib/server')
  var child = spawn('node', [server], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  child.unref()
  setTimeout(function() {
    wait(callback)
  }, 100)
}

module.exports = function(callback) {
  check(function(err) {
    if (!err) {
      process.stdout.write('Already running\n')
    } else {
      launch(callback)
    }
  })
}
