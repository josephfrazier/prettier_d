"use strict";

const fs = require("fs");
const findProjectRoot = require("find-project-root");

let dir;
try {
  dir = findProjectRoot(process.cwd());
  if (!dir) {
    throw "could not find project root"
  }
} catch (e) {
  const homeEnv = process.platform === "win32" ? "USERPROFILE" : "HOME";
  dir = process.env[homeEnv];
}

const dataFile = dir + "/.prettier_d";

exports.path = dataFile;

exports.write = function(port, token) {
  fs.writeFileSync(dataFile, port + " " + token);
};

exports.read = function() {
  if (fs.existsSync(dataFile)) {
    const data = fs.readFileSync(dataFile, "utf8").split(" ");
    return {
      port: Number(data[0]),
      token: data[1]
    };
  }
  return null;
};

exports.unlink = function() {
  if (fs.existsSync(dataFile)) {
    fs.unlinkSync(dataFile);
  }
};
