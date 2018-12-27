"use strict";

module.exports = function(cwd, args, text) {
  process.chdir(cwd);

  const options = {
    input: text
  };
  const result = require("../tests_integration/runPrettier.js")(
    cwd,
    args,
    options
  );
  return JSON.stringify(result);
};
