#!/usr/bin/env node
"use strict";

const getStdin = require("get-stdin");

function start() {
  require("../lib/launcher")();
}

const cmd = process.argv[2];
if (cmd === "start") {
  start();
  return;
}

const client = require("../lib/client");
if (cmd === "restart") {
  client.stop(() => {
    process.nextTick(start);
  });
  return;
}

const commands = ["stop", "status", "restart"];
if (commands.indexOf(cmd) > -1) {
  client[cmd](process.argv.slice(3));
  return;
}

const args = process.argv.slice(2);

if (!require("supports-color")) {
  args.unshift("--no-color");
}

getStdin().then(text => {
  client.lint(args, text);
});
