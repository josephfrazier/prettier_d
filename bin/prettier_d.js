#!/usr/bin/env node
"use strict";

const getStdin = require("get-stdin");

const client = require("../lib/client");

function start() {
  client.launcher();
}

const cmd = process.argv[2];
if (cmd === "start") {
  start();
  return;
}
if (cmd === "restart") {
  client.stop(() => {
    process.nextTick(start);
  });
  return;
}

const commands = ["stop", "status", "restart"];
if (commands.includes(cmd)) {
  client[cmd](process.argv.slice(3));
  return;
}

const args = process.argv.slice(2);

if (!require("supports-color")) {
  args.unshift("--no-color");
}

getStdin().then((text) => {
  client.lint(args, text);
});
