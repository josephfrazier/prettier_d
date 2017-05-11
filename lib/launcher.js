'use strict'

var net = require('net')
var portfile = require('../lib/portfile')

function check(callback) {
  var data = portfile.read()
  if (!data) {
    callback(Error('Not running'))
    return
  }
  var socket = net.connect(data.port, function() {
    socket.end()
    callback(null)
  })
  socket.on('error', function() {
    callback(Error('Not running'))
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
