#!/usr/bin/env node
"use strict";

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

const useStdIn = process.argv.indexOf("--stdin") > -1;
const args = process.argv.slice(2);

if (!require("supports-color")) {
  args.unshift("--no-color");
}

if (!useStdIn) {
  client.lint(args);
  return;
}

let text = "";
process.stdin.setEncoding("utf8");

process.stdin.on("data", chunk => {
  text += chunk;
});

process.stdin.on("end", () => {
  client.lint(args, text);
});
