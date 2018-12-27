"use strict";

const runPrettier = require("../runPrettier");

test("do not show logs with --loglevel silent", () => {
  runPrettierWithLogLevel("silent", null);
});

test("do not show warnings with --loglevel error", () => {
  runPrettierWithLogLevel("error", ["[error]"]);
});

test("show errors and warnings with --loglevel warn", () => {
  runPrettierWithLogLevel("warn", ["[error]", "[warn]"]);
});

test("show all logs with --loglevel debug", () => {
  runPrettierWithLogLevel("debug", ["[error]", "[warn]", "[debug]"]);
});

describe("--write with --loglevel=silent doesn't log filenames", () => {
  runPrettier("cli/write", [
    "--write",
    "unformatted.js",
    "--loglevel=silent"
  ]).test({
    status: 0
  });
});

function runPrettierWithLogLevel(logLevel, patterns) {
  const result = runPrettier("cli/loglevel", [
    "--loglevel",
    logLevel,
    "--unknown-option",
    "--parser",
    "unknown-parser",
    "not-found.js"
  ]);

  expect(result).not.toEqual(0);

  if (patterns) {
    patterns.forEach(pattern => {
      expect(result.stderr).toMatch(pattern);
    });
  } else {
    expect(result.stderr).toMatch(/^\s*$/);
  }
}
