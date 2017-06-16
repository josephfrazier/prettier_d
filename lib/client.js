'use strict'

const net = require('net')
const portfile = require('./portfile')

exports.connect = connect
function connect(callback) {
  const data = portfile.read()
  if (!data) {
    return callback(Error('Not running'))
  }
  net
    .connect(data.port, function() {
      callback(null, this, data.token)
    })
    .on('error', () => {
      callback(Error('Could not connect'))
    })
}

exports.stop = function(callback) {
  connect((err, socket, token) => {
    if (err) {
      process.stdout.write(err + '\n')
      return
    }
    socket.end(token + ' stop', () => {
      if (typeof callback === 'function') {
        callback()
      }
    })
  })
}

exports.status = function() {
  connect((err, socket) => {
    if (err) {
      process.stdout.write(err + '\n')
      return
    }
    socket.end(() => {
      process.stdout.write('Running\n')
    })
  })
}

exports.lint = function(args, text) {
  if (!args.length && !text) {
    process.stdout.write('No files specified\n')
    return
  }

  function lint(socket, token) {
    let buf = ''
    socket.on('data', chunk => {
      buf += chunk
      const p = buf.lastIndexOf('\n')
      if (p !== -1) {
        process.stdout.write(buf.substring(0, p + 1))
        buf = buf.substring(p + 1)
      }
    })
    socket.on('end', () => {
      if (buf) {
        if (buf === '# exit 1') {
          process.exitCode = 1
        } else {
          process.stdout.write(buf)
        }
      }
    })
    socket.end(
      token +
        ' ' +
        JSON.stringify({
          cwd: process.cwd(),
          args: args,
          text: text,
        })
    )
  }
  connect((err, socket, token) => {
    if (err) {
      require('./launcher')(() => {
        connect((err, socket, token) => {
          if (err) {
            process.stdout.write(err + '\n')
          } else {
            lint(socket, token)
          }
        })
      })
    } else {
      lint(socket, token)
    }
  })
}
