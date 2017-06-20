'use strict'

const connect = require('./client').connect

function check(callback) {
  connect((err, socket, token) => {
    if (socket) {
      socket.end()
    }
    callback(err, socket, token)
  })
}

function wait(callback) {
  check(err => {
    if (!err) {
      if (typeof callback === 'function') {
        callback(null)
      }
    } else {
      setTimeout(() => {
        wait(callback)
      }, 100)
    }
  })
}

function launch(callback) {
  const spawn = require('child_process').spawn
  const server = require.resolve('../lib/server')
  const child = spawn('node', [server], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  child.unref()
  setTimeout(() => {
    wait(callback)
  }, 100)
}

module.exports = function(callback) {
  check(err => {
    if (!err) {
      process.stdout.write('Already running\n')
    } else {
      launch(callback)
    }
  })
}
