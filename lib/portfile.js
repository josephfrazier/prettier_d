'use strict'

const fs = require('fs')

const homeEnv = process.platform === 'win32' ? 'USERPROFILE' : 'HOME'
const dataFile = process.env[homeEnv] + '/.prettier_d'

exports.write = function(port, token) {
  fs.writeFileSync(dataFile, port + ' ' + token)
}

exports.read = function() {
  if (fs.existsSync(dataFile)) {
    const data = fs.readFileSync(dataFile, 'utf8').split(' ')
    return {
      port: Number(data[0]),
      token: data[1],
    }
  }
  return null
}

exports.unlink = function() {
  if (fs.existsSync(dataFile)) {
    fs.unlinkSync(dataFile)
  }
}
