"use strict";

module.exports = function(cwd, args, text) {
  process.chdir(cwd);

  return formatText(text, args, cwd);
};

function formatText(text, args, cwd) {
  return prettierFormat(text, args, cwd);
}

function prettierFormat(text, args, cwd) {
  const options = {
    input: text
  };
  const result = require("../tests_integration/runPrettier.js")(
    cwd,
    args,
    options
  );
  const report = result.stdout;

  // TODO write all files in `result.write` or have `runPrettier` do it

  return report;
}
