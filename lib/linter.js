"use strict";

const fs = require("fs");
const options = require("./options");
const path = require("path");
const unquote = require("unquote");
const configAttendant = require("config-attendant");
const editorconfig = require("editorconfig");

const prettierMap = {};
const filenameMap = {};

module.exports = function(cwd, args, text) {
  process.chdir(cwd);

  let currentOptions;

  try {
    currentOptions = options.parse([0, 0].concat(args));
  } catch (e) {
    return e.message + "\n# exit 1";
  }

  const files = currentOptions._;
  const stdin = currentOptions.stdin;

  if (!files.length && (!stdin || typeof text !== "string")) {
    return options.generateHelp() + "\n";
  }

  const filename = unquote(files[0]);

  if (!stdin) {
    text = fs.readFileSync(path.resolve(cwd, filename).trim()).toString();
  }

  return formatText(text, currentOptions, filename, cwd);
};

function formatText(text, currentOptions, filename, cwd) {
  try {
    return prettierFormat(text, currentOptions, filename, cwd);
  } catch (err) {
    if (!currentOptions.fallback) {
      throw err;
    }

    return text;
  }
}

function prettierFormat(text, currentOptions, filename, cwd) {
  const cwdDeps = getCwdDeps(cwd);
  const filenameDeps = getFilenameDeps(path.join(cwd, filename));

  // TODO merge options better:
  // right now, currentOptions is the result of having cli options override prettier defaults,
  // but the package.json options need to go in the middle:
  // Object.assign({}, __prettier__defaults__, cwdDeps.prettierOptions, __cli__options__)
  const filenameOptions = currentOptions.pkgConf
    ? Object.assign(
        {},
        editorConfigToPrettier(filenameDeps.editorConfig),
        cwdDeps.prettierOptions
      )
    : {};
  const mergedOptions = Object.assign({}, currentOptions, filenameOptions);

  if (mergedOptions.listDifferent) {
    if (!cwdDeps.prettier.check(text, mergedOptions)) {
      // This looks weird, but it's to make sure that we have the right
      // output and exit code
      throw filename;
    } else {
      return "";
    }
  } else {

    let report = cwdDeps.prettier.format(text, mergedOptions);


    if (mergedOptions.write) {
      if (report !== text) {
        fs.writeFileSync(filename, report, "utf8");
      }

      report = "";
    }

    return report;
  }
}

function getCwdDeps(cwd) {
  let cwdDeps = prettierMap[cwd];

  if (!cwdDeps) {
    cwdDeps = prettierMap[cwd] = {
      prettier: require("../"),
      // The empty objects are:
      // 1. The defaults object (omitted since those are included in currentOptions)
      // 2. The argv object to override what minimist might think it has (because this is the server)
      prettierOptions: configAttendant("prettier", {}, {})
    };
  }

  return cwdDeps;
}

function getFilenameDeps(filename) {
  let filenameDeps = filenameMap[filename];

  if (!filenameDeps) {
    filenameDeps = filenameMap[filename] = {
      editorConfig: editorconfig.parseSync(filename)
    };
  }

  return filenameDeps;
}

function editorConfigToPrettier(editorConfig) {
  const result = {};
  result.useTabs = editorConfig.indent_style === "tab" || result.useTabs;
  result.tabWidth = editorConfig.tab_width || result.tabWidth;
  result.printWidth = editorConfig.max_line_length || result.printWidth;
  return result;
}
