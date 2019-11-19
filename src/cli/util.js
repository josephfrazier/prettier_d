"use strict";

const path = require("path");
const camelCase = require("camelcase");
const dashify = require("dashify");
const fs = require("fs");
const globby = require("globby");
const chalk = require("chalk");
const readline = require("readline");
const stringify = require("json-stable-stringify");

const minimist = require("./minimist");
const prettier = require("../../index");
const createIgnorer = require("../common/create-ignorer");
const errors = require("../common/errors");
const constant = require("./constant");
const coreOptions = require("../main/core-options");
const optionsModule = require("../main/options");
const optionsNormalizer = require("../main/options-normalizer");
const thirdParty = require("../common/third-party");
const arrayify = require("../utils/arrayify");
const isTTY = require("../utils/is-tty");

const OPTION_USAGE_THRESHOLD = 25;
const CHOICE_USAGE_MARGIN = 3;
const CHOICE_USAGE_INDENTATION = 2;

function getOptions(argv, detailedOptions) {
  return detailedOptions
    .filter(option => option.forwardToApi)
    .reduce(
      (current, option) =>
        Object.assign(current, {
          [option.forwardToApi]: argv[option.name]
        }),
      {}
    );
}

function cliifyOptions(object, apiDetailedOptionMap) {
  return Object.keys(object || {}).reduce((output, key) => {
    const apiOption = apiDetailedOptionMap[key];
    const cliKey = apiOption ? apiOption.name : key;

    output[dashify(cliKey)] = object[key];
    return output;
  }, {});
}

function diff(a, b) {
  return require("diff").createTwoFilesPatch("", "", a, b, "", "", {
    context: 2
  });
}

function handleError(context, filename, error) {
  if (error instanceof errors.UndefinedParserError) {
    if (context.argv["write"] && isTTY()) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0, null);
    }
    if (!context.argv["check"] && !context.argv["list-different"]) {
      process.exitCode = 2;
    }
    context.logger.error(error.message);
    return;
  }

  if (context.argv["write"]) {
    // Add newline to split errors from filename line.
    process.stdout.write("\n");
  }

  const isParseError = Boolean(error && error.loc);
  const isValidationError = /^Invalid \S+ value\./.test(error && error.message);

  if (isParseError) {
    // `invalid.js: SyntaxError: Unexpected token (1:1)`.
    context.logger.error(`${filename}: ${String(error)}`);
  } else if (isValidationError || error instanceof errors.ConfigError) {
    // `Invalid printWidth value. Expected an integer, but received 0.5.`
    context.logger.error(error.message);
    // If validation fails for one file, it will fail for all of them.
    process.exit(1);
  } else if (error instanceof errors.DebugError) {
    // `invalid.js: Some debug error message`
    context.logger.error(`${filename}: ${error.message}`);
  } else {
    // `invalid.js: Error: Some unexpected error\n[stack trace]`
    context.logger.error(filename + ": " + (error.stack || error));
  }

  // Don't exit the process if one file failed
  process.exitCode = 2;
}

function logResolvedConfigPathOrDie(context) {
  const configFile = prettier.resolveConfigFile.sync(
    context.argv["find-config-path"]
  );
  if (configFile) {
    context.logger.log(path.relative(process.cwd(), configFile));
  } else {
    process.exit(1);
  }
}

function logFileInfoOrDie(context) {
  const options = {
    ignorePath: context.argv["ignore-path"],
    withNodeModules: context.argv["with-node-modules"],
    plugins: context.argv["plugin"],
    pluginSearchDirs: context.argv["plugin-search-dir"]
  };
  context.logger.log(
    prettier.format(
      stringify(prettier.getFileInfo.sync(context.argv["file-info"], options)),
      { parser: "json" }
    )
  );
}

function writeOutput(context, result, options) {
  // Don't use `console.log` here since it adds an extra newline at the end.
  process.stdout.write(
    context.argv["debug-check"] ? result.filepath : result.formatted
  );

  if (options && options.cursorOffset >= 0) {
    process.stderr.write(result.cursorOffset + "\n");
  }
}

function listDifferent(context, input, options, filename) {
  if (!context.argv["check"] && !context.argv["list-different"]) {
    return;
  }

  try {
    if (!options.filepath && !options.parser) {
      throw new errors.UndefinedParserError(
        "No parser and no file path given, couldn't infer a parser."
      );
    }
    if (!prettier.check(input, options)) {
      if (!context.argv["write"]) {
        context.logger.log(filename);
        process.exitCode = 1;
      }
    }
  } catch (error) {
    context.logger.error(error.message);
  }

  return true;
}

function format(context, input, opt) {
  if (!opt.parser && !opt.filepath) {
    throw new errors.UndefinedParserError(
      "No parser and no file path given, couldn't infer a parser."
    );
  }

  if (context.argv["debug-print-doc"]) {
    const doc = prettier.__debug.printToDoc(input, opt);
    return { formatted: prettier.__debug.formatDoc(doc) };
  }

  if (context.argv["debug-check"]) {
    const pp = prettier.format(input, opt);
    const pppp = prettier.format(pp, opt);
    if (pp !== pppp) {
      throw new errors.DebugError(
        "prettier(input) !== prettier(prettier(input))\n" + diff(pp, pppp)
      );
    } else {
      const stringify = obj => JSON.stringify(obj, null, 2);
      const ast = stringify(
        prettier.__debug.parse(input, opt, /* massage */ true).ast
      );
      const past = stringify(
        prettier.__debug.parse(pp, opt, /* massage */ true).ast
      );

      if (ast !== past) {
        const MAX_AST_SIZE = 2097152; // 2MB
        const astDiff =
          ast.length > MAX_AST_SIZE || past.length > MAX_AST_SIZE
            ? "AST diff too large to render"
            : diff(ast, past);
        throw new errors.DebugError(
          "ast(input) !== ast(prettier(input))\n" +
            astDiff +
            "\n" +
            diff(input, pp)
        );
      }
    }
    return { formatted: pp, filepath: opt.filepath || "(stdin)\n" };
  }

  /* istanbul ignore if */
  if (context.argv["debug-benchmark"]) {
    let benchmark;
    try {
      benchmark = eval("require")("benchmark");
    } catch (err) {
      context.logger.debug(
        "'--debug-benchmark' requires the 'benchmark' package to be installed."
      );
      process.exit(2);
    }
    context.logger.debug(
      "'--debug-benchmark' option found, measuring formatWithCursor with 'benchmark' module."
    );
    const suite = new benchmark.Suite();
    suite
      .add("format", () => {
        prettier.formatWithCursor(input, opt);
      })
      .on("cycle", event => {
        const results = {
          benchmark: String(event.target),
          hz: event.target.hz,
          ms: event.target.times.cycle * 1000
        };
        context.logger.debug(
          "'--debug-benchmark' measurements for formatWithCursor: " +
            JSON.stringify(results, null, 2)
        );
      })
      .run({ async: false });
  } else if (context.argv["debug-repeat"] > 0) {
    const repeat = context.argv["debug-repeat"];
    context.logger.debug(
      "'--debug-repeat' option found, running formatWithCursor " +
        repeat +
        " times."
    );
    // should be using `performance.now()`, but only `Date` is cross-platform enough
    const now = Date.now ? () => Date.now() : () => +new Date();
    let totalMs = 0;
    for (let i = 0; i < repeat; ++i) {
      const startMs = now();
      prettier.formatWithCursor(input, opt);
      totalMs += now() - startMs;
    }
    const averageMs = totalMs / repeat;
    const results = {
      repeat,
      hz: 1000 / averageMs,
      ms: averageMs
    };
    context.logger.debug(
      "'--debug-repeat' measurements for formatWithCursor: " +
        JSON.stringify(results, null, 2)
    );
  }

  return prettier.formatWithCursor(input, opt);
}

function getOptionsOrDie(context, filePath) {
  try {
    if (context.argv["config"] === false) {
      context.logger.debug(
        "'--no-config' option found, skip loading config file."
      );
      return null;
    }

    context.logger.debug(
      context.argv["config"]
        ? `load config file from '${context.argv["config"]}'`
        : `resolve config from '${filePath}'`
    );

    const options = prettier.resolveConfig.sync(filePath, {
      editorconfig: context.argv["editorconfig"],
      config: context.argv["config"]
    });

    context.logger.debug("loaded options `" + JSON.stringify(options) + "`");
    return options;
  } catch (error) {
    context.logger.error(
      `Invalid configuration file \`${filePath}\`: ` + error.message
    );
    process.exit(2);
  }
}

function getOptionsForFile(context, filepath) {
  const options = getOptionsOrDie(context, filepath);

  const hasPlugins = options && options.plugins;
  if (hasPlugins) {
    pushContextPlugins(context, options.plugins);
  }

  const appliedOptions = Object.assign(
    { filepath },
    applyConfigPrecedence(
      context,
      options &&
        optionsNormalizer.normalizeApiOptions(options, context.supportOptions, {
          logger: context.logger
        })
    )
  );

  context.logger.debug(
    `applied config-precedence (${context.argv["config-precedence"]}): ` +
      `${JSON.stringify(appliedOptions)}`
  );

  if (hasPlugins) {
    popContextPlugins(context);
  }

  return appliedOptions;
}

function parseArgsToOptions(context, overrideDefaults) {
  const minimistOptions = createMinimistOptions(context.detailedOptions);
  const apiDetailedOptionMap = createApiDetailedOptionMap(
    context.detailedOptions
  );
  return getOptions(
    optionsNormalizer.normalizeCliOptions(
      minimist(
        context.args,
        Object.assign({
          string: minimistOptions.string,
          boolean: minimistOptions.boolean,
          default: cliifyOptions(overrideDefaults, apiDetailedOptionMap)
        })
      ),
      context.detailedOptions,
      { logger: false }
    ),
    context.detailedOptions
  );
}

function applyConfigPrecedence(context, options) {
  try {
    switch (context.argv["config-precedence"]) {
      case "cli-override":
        return parseArgsToOptions(context, options);
      case "file-override":
        return Object.assign({}, parseArgsToOptions(context), options);
      case "prefer-file":
        return options || parseArgsToOptions(context);
    }
  } catch (error) {
    context.logger.error(error.toString());
    process.exit(2);
  }
}

function formatStdin(context) {
  const filepath = context.argv["stdin-filepath"]
    ? path.resolve(process.cwd(), context.argv["stdin-filepath"])
    : process.cwd();

  const ignorer = createIgnorerFromContextOrDie(context);
  const relativeFilepath = path.relative(process.cwd(), filepath);

  thirdParty
    .getStream(process.stdin)
    .then(input => {
      if (relativeFilepath && ignorer.filter([relativeFilepath]).length === 0) {
        writeOutput(context, { formatted: input });
        return;
      }

      const options = getOptionsForFile(context, filepath);

      if (listDifferent(context, input, options, "(stdin)")) {
        return;
      }

      writeOutput(context, format(context, input, options), options);
    })
    .catch(error => {
      handleError(context, relativeFilepath || "stdin", error);
    });
}

function createIgnorerFromContextOrDie(context) {
  try {
    return createIgnorer.sync(
      context.argv["ignore-path"],
      context.argv["with-node-modules"]
    );
  } catch (e) {
    context.logger.error(e.message);
    process.exit(2);
  }
}

function eachFilename(context, patterns, callback) {
  // The '!./' globs are due to https://github.com/prettier/prettier/issues/2110
  const ignoreNodeModules = context.argv["with-node-modules"] !== true;
  if (ignoreNodeModules) {
    patterns = patterns.concat(["!**/node_modules/**", "!./node_modules/**"]);
  }
  patterns = patterns.concat(["!**/.{git,svn,hg}/**", "!./.{git,svn,hg}/**"]);

  try {
    const filePaths = globby
      .sync(patterns, { dot: true, nodir: true })
      .map(filePath => path.relative(process.cwd(), filePath));

    if (filePaths.length === 0) {
      context.logger.error(
        `No matching files. Patterns tried: ${patterns.join(" ")}`
      );
      process.exitCode = 2;
      return;
    }
    filePaths.forEach(filePath => callback(filePath));
  } catch (error) {
    context.logger.error(
      `Unable to expand glob patterns: ${patterns.join(" ")}\n${error.message}`
    );
    // Don't exit the process if one pattern failed
    process.exitCode = 2;
  }
}

function formatFiles(context) {
  // The ignorer will be used to filter file paths after the glob is checked,
  // before any files are actually written
  const ignorer = createIgnorerFromContextOrDie(context);

  let numberOfUnformattedFilesFound = 0;

  if (context.argv["check"]) {
    context.logger.log("Checking formatting...");
  }

  eachFilename(context, context.filePatterns, filename => {
    const fileIgnored = ignorer.filter([filename]).length === 0;
    if (
      fileIgnored &&
      (context.argv["debug-check"] ||
        context.argv["write"] ||
        context.argv["check"] ||
        context.argv["list-different"])
    ) {
      return;
    }

    const options = Object.assign(getOptionsForFile(context, filename), {
      filepath: filename
    });

    if (isTTY()) {
      context.logger.log(filename, { newline: false });
    }

    let input;
    try {
      input = fs.readFileSync(filename, "utf8");
    } catch (error) {
      // Add newline to split errors from filename line.
      context.logger.log("");

      context.logger.error(
        `Unable to read file: ${filename}\n${error.message}`
      );
      // Don't exit the process if one file failed
      process.exitCode = 2;
      return;
    }

    if (fileIgnored) {
      writeOutput(context, { formatted: input }, options);
      return;
    }

    const start = Date.now();

    let result;
    let output;

    try {
      result = format(
        context,
        input,
        Object.assign({}, options, { filepath: filename })
      );
      output = result.formatted;
    } catch (error) {
      handleError(context, filename, error);
      return;
    }

    const isDifferent = output !== input;

    if (isTTY()) {
      // Remove previously printed filename to log it with duration.
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0, null);
    }

    if (context.argv["write"]) {
      // Don't write the file if it won't change in order not to invalidate
      // mtime based caches.
      if (isDifferent) {
        if (!context.argv["check"] && !context.argv["list-different"]) {
          context.logger.log(`${filename} ${Date.now() - start}ms`);
        }

        try {
          fs.writeFileSync(filename, output, "utf8");
        } catch (error) {
          context.logger.error(
            `Unable to write file: ${filename}\n${error.message}`
          );
          // Don't exit the process if one file failed
          process.exitCode = 2;
        }
      } else if (!context.argv["check"] && !context.argv["list-different"]) {
        context.logger.log(`${chalk.grey(filename)} ${Date.now() - start}ms`);
      }
    } else if (context.argv["debug-check"]) {
      if (result.filepath) {
        context.logger.log(result.filepath);
      } else {
        process.exitCode = 2;
      }
    } else if (!context.argv["check"] && !context.argv["list-different"]) {
      writeOutput(context, result, options);
    }

    if (
      (context.argv["check"] || context.argv["list-different"]) &&
      isDifferent
    ) {
      context.logger.log(filename);
      numberOfUnformattedFilesFound += 1;
    }
  });

  // Print check summary based on expected exit code
  if (context.argv["check"]) {
    context.logger.log(
      numberOfUnformattedFilesFound === 0
        ? "All matched files use Prettier code style!"
        : context.argv["write"]
        ? "Code style issues fixed in the above file(s)."
        : "Code style issues found in the above file(s). Forgot to run Prettier?"
    );
  }

  // Ensure non-zero exitCode when using --check/list-different is not combined with --write
  if (
    (context.argv["check"] || context.argv["list-different"]) &&
    numberOfUnformattedFilesFound > 0 &&
    !process.exitCode &&
    !context.argv["write"]
  ) {
    process.exitCode = 1;
  }
}

function getOptionsWithOpposites(options) {
  // Add --no-foo after --foo.
  const optionsWithOpposites = options.map(option => [
    option.description ? option : null,
    option.oppositeDescription
      ? Object.assign({}, option, {
          name: `no-${option.name}`,
          type: "boolean",
          description: option.oppositeDescription
        })
      : null
  ]);
  return flattenArray(optionsWithOpposites).filter(Boolean);
}

function createUsage(context) {
  const options = getOptionsWithOpposites(context.detailedOptions).filter(
    // remove unnecessary option (e.g. `semi`, `color`, etc.), which is only used for --help <flag>
    option =>
      !(
        option.type === "boolean" &&
        option.oppositeDescription &&
        !option.name.startsWith("no-")
      )
  );

  const groupedOptions = groupBy(options, option => option.category);

  const firstCategories = constant.categoryOrder.slice(0, -1);
  const lastCategories = constant.categoryOrder.slice(-1);
  const restCategories = Object.keys(groupedOptions).filter(
    category =>
      firstCategories.indexOf(category) === -1 &&
      lastCategories.indexOf(category) === -1
  );
  const allCategories = firstCategories.concat(restCategories, lastCategories);

  const optionsUsage = allCategories.map(category => {
    const categoryOptions = groupedOptions[category]
      .map(option => createOptionUsage(context, option, OPTION_USAGE_THRESHOLD))
      .join("\n");
    return `${category} options:\n\n${indent(categoryOptions, 2)}`;
  });

  return [constant.usageSummary].concat(optionsUsage, [""]).join("\n\n");
}

function createOptionUsage(context, option, threshold) {
  const header = createOptionUsageHeader(option);
  const optionDefaultValue = getOptionDefaultValue(context, option.name);
  return createOptionUsageRow(
    header,
    `${option.description}${
      optionDefaultValue === undefined
        ? ""
        : `\nDefaults to ${createDefaultValueDisplay(optionDefaultValue)}.`
    }`,
    threshold
  );
}

function createDefaultValueDisplay(value) {
  return Array.isArray(value)
    ? `[${value.map(createDefaultValueDisplay).join(", ")}]`
    : value;
}

function createOptionUsageHeader(option) {
  const name = `--${option.name}`;
  const alias = option.alias ? `-${option.alias},` : null;
  const type = createOptionUsageType(option);
  return [alias, name, type].filter(Boolean).join(" ");
}

function createOptionUsageRow(header, content, threshold) {
  const separator =
    header.length >= threshold
      ? `\n${" ".repeat(threshold)}`
      : " ".repeat(threshold - header.length);

  const description = content.replace(/\n/g, `\n${" ".repeat(threshold)}`);

  return `${header}${separator}${description}`;
}

function createOptionUsageType(option) {
  switch (option.type) {
    case "boolean":
      return null;
    case "choice":
      return `<${option.choices
        .filter(choice => choice.since !== null)
        .filter(choice => !choice.deprecated)
        .map(choice => choice.value)
        .join("|")}>`;
    default:
      return `<${option.type}>`;
  }
}

function flattenArray(array) {
  return [].concat.apply([], array);
}

function createChoiceUsages(choices, margin, indentation) {
  const activeChoices = choices.filter(
    choice => !choice.deprecated && choice.since !== null
  );
  const threshold =
    activeChoices
      .map(choice => choice.value.length)
      .reduce((current, length) => Math.max(current, length), 0) + margin;
  return activeChoices.map(choice =>
    indent(
      createOptionUsageRow(choice.value, choice.description, threshold),
      indentation
    )
  );
}

function createDetailedUsage(context, flag) {
  const option = getOptionsWithOpposites(context.detailedOptions).find(
    option => option.name === flag || option.alias === flag
  );

  const header = createOptionUsageHeader(option);
  const description = `\n\n${indent(option.description, 2)}`;

  const choices =
    option.type !== "choice"
      ? ""
      : `\n\nValid options:\n\n${createChoiceUsages(
          option.choices,
          CHOICE_USAGE_MARGIN,
          CHOICE_USAGE_INDENTATION
        ).join("\n")}`;

  const optionDefaultValue = getOptionDefaultValue(context, option.name);
  const defaults =
    optionDefaultValue !== undefined
      ? `\n\nDefault: ${createDefaultValueDisplay(optionDefaultValue)}`
      : "";

  const pluginDefaults =
    option.pluginDefaults && Object.keys(option.pluginDefaults).length
      ? `\nPlugin defaults:${Object.keys(option.pluginDefaults).map(
          key =>
            `\n* ${key}: ${createDefaultValueDisplay(
              option.pluginDefaults[key]
            )}`
        )}`
      : "";
  return `${header}${description}${choices}${defaults}${pluginDefaults}`;
}

function getOptionDefaultValue(context, optionName) {
  // --no-option
  if (!(optionName in context.detailedOptionMap)) {
    return undefined;
  }

  const option = context.detailedOptionMap[optionName];

  if (option.default !== undefined) {
    return option.default;
  }

  const optionCamelName = camelCase(optionName);
  if (optionCamelName in context.apiDefaultOptions) {
    return context.apiDefaultOptions[optionCamelName];
  }

  return undefined;
}

function indent(str, spaces) {
  return str.replace(/^/gm, " ".repeat(spaces));
}

function groupBy(array, getKey) {
  return array.reduce((obj, item) => {
    const key = getKey(item);
    const previousItems = key in obj ? obj[key] : [];
    return Object.assign({}, obj, { [key]: previousItems.concat(item) });
  }, Object.create(null));
}

function pick(object, keys) {
  return !keys
    ? object
    : keys.reduce(
        (reduced, key) => Object.assign(reduced, { [key]: object[key] }),
        {}
      );
}

function createLogger(logLevel) {
  return {
    warn: createLogFunc("warn", "yellow"),
    error: createLogFunc("error", "red"),
    debug: createLogFunc("debug", "blue"),
    log: createLogFunc("log")
  };

  function createLogFunc(loggerName, color) {
    if (!shouldLog(loggerName)) {
      return () => {};
    }

    const prefix = color ? `[${chalk[color](loggerName)}] ` : "";
    return function(message, opts) {
      opts = Object.assign({ newline: true }, opts);
      const stream = process[loggerName === "log" ? "stdout" : "stderr"];
      stream.write(message.replace(/^/gm, prefix) + (opts.newline ? "\n" : ""));
    };
  }

  function shouldLog(loggerName) {
    switch (logLevel) {
      case "silent":
        return false;
      default:
        return true;
      case "debug":
        if (loggerName === "debug") {
          return true;
        }
      // fall through
      case "log":
        if (loggerName === "log") {
          return true;
        }
      // fall through
      case "warn":
        if (loggerName === "warn") {
          return true;
        }
      // fall through
      case "error":
        return loggerName === "error";
    }
  }
}

function normalizeDetailedOption(name, option) {
  return Object.assign({ category: coreOptions.CATEGORY_OTHER }, option, {
    choices:
      option.choices &&
      option.choices.map(choice => {
        const newChoice = Object.assign(
          { description: "", deprecated: false },
          typeof choice === "object" ? choice : { value: choice }
        );
        if (newChoice.value === true) {
          newChoice.value = ""; // backward compatibility for original boolean option
        }
        return newChoice;
      })
  });
}

function normalizeDetailedOptionMap(detailedOptionMap) {
  return Object.keys(detailedOptionMap)
    .sort()
    .reduce((normalized, name) => {
      const option = detailedOptionMap[name];
      return Object.assign(normalized, {
        [name]: normalizeDetailedOption(name, option)
      });
    }, {});
}

function createMinimistOptions(detailedOptions) {
  return {
    // we use vnopts' AliasSchema to handle aliases for better error messages
    alias: {},
    boolean: detailedOptions
      .filter(option => option.type === "boolean")
      .map(option => [option.name].concat(option.alias || []))
      .reduce((a, b) => a.concat(b)),
    string: detailedOptions
      .filter(option => option.type !== "boolean")
      .map(option => [option.name].concat(option.alias || []))
      .reduce((a, b) => a.concat(b)),
    default: detailedOptions
      .filter(option => !option.deprecated)
      .filter(
        option =>
          !option.forwardToApi ||
          option.name === "plugin" ||
          option.name === "plugin-search-dir"
      )
      .filter(option => option.default !== undefined)
      .reduce(
        (current, option) =>
          Object.assign({ [option.name]: option.default }, current),
        {}
      )
  };
}

function createApiDetailedOptionMap(detailedOptions) {
  return detailedOptions.reduce(
    (current, option) =>
      option.forwardToApi && option.forwardToApi !== option.name
        ? Object.assign(current, { [option.forwardToApi]: option })
        : current,
    {}
  );
}

function createDetailedOptionMap(supportOptions) {
  return supportOptions.reduce((reduced, option) => {
    const newOption = Object.assign({}, option, {
      name: option.cliName || dashify(option.name),
      description: option.cliDescription || option.description,
      category: option.cliCategory || coreOptions.CATEGORY_FORMAT,
      forwardToApi: option.name
    });

    if (option.deprecated) {
      delete newOption.forwardToApi;
      delete newOption.description;
      delete newOption.oppositeDescription;
      newOption.deprecated = true;
    }

    return Object.assign(reduced, { [newOption.name]: newOption });
  }, {});
}

//-----------------------------context-util-start-------------------------------
/**
 * @typedef {Object} Context
 * @property logger
 * @property args
 * @property argv
 * @property filePatterns
 * @property supportOptions
 * @property detailedOptions
 * @property detailedOptionMap
 * @property apiDefaultOptions
 */
function createContext(args) {
  const context = { args };

  updateContextArgv(context);
  normalizeContextArgv(context, ["loglevel", "plugin", "plugin-search-dir"]);

  context.logger = createLogger(context.argv["loglevel"]);

  updateContextArgv(
    context,
    context.argv["plugin"],
    context.argv["plugin-search-dir"]
  );

  return context;
}

function initContext(context) {
  // split into 2 step so that we could wrap this in a `try..catch` in cli/index.js
  normalizeContextArgv(context);
}

function updateContextOptions(context, plugins, pluginSearchDirs) {
  const supportOptions = prettier.getSupportInfo(null, {
    showDeprecated: true,
    showUnreleased: true,
    showInternal: true,
    plugins,
    pluginSearchDirs
  }).options;

  const detailedOptionMap = normalizeDetailedOptionMap(
    Object.assign({}, createDetailedOptionMap(supportOptions), constant.options)
  );

  const detailedOptions = arrayify(detailedOptionMap, "name");

  const apiDefaultOptions = supportOptions
    .filter(optionInfo => !optionInfo.deprecated)
    .reduce(
      (reduced, optionInfo) =>
        Object.assign(reduced, { [optionInfo.name]: optionInfo.default }),
      Object.assign({}, optionsModule.hiddenDefaults)
    );

  context.supportOptions = supportOptions;
  context.detailedOptions = detailedOptions;
  context.detailedOptionMap = detailedOptionMap;
  context.apiDefaultOptions = apiDefaultOptions;
}

function pushContextPlugins(context, plugins, pluginSearchDirs) {
  context._supportOptions = context.supportOptions;
  context._detailedOptions = context.detailedOptions;
  context._detailedOptionMap = context.detailedOptionMap;
  context._apiDefaultOptions = context.apiDefaultOptions;
  updateContextOptions(context, plugins, pluginSearchDirs);
}

function popContextPlugins(context) {
  context.supportOptions = context._supportOptions;
  context.detailedOptions = context._detailedOptions;
  context.detailedOptionMap = context._detailedOptionMap;
  context.apiDefaultOptions = context._apiDefaultOptions;
}

function updateContextArgv(context, plugins, pluginSearchDirs) {
  pushContextPlugins(context, plugins, pluginSearchDirs);

  const minimistOptions = createMinimistOptions(context.detailedOptions);
  const argv = minimist(context.args, minimistOptions);

  context.argv = argv;
  context.filePatterns = argv["_"];
}

function normalizeContextArgv(context, keys) {
  const detailedOptions = !keys
    ? context.detailedOptions
    : context.detailedOptions.filter(
        option => keys.indexOf(option.name) !== -1
      );
  const argv = !keys ? context.argv : pick(context.argv, keys);

  context.argv = optionsNormalizer.normalizeCliOptions(argv, detailedOptions, {
    logger: context.logger
  });
}
//------------------------------context-util-end--------------------------------

module.exports = {
  createContext,
  createDetailedOptionMap,
  createDetailedUsage,
  createUsage,
  format,
  formatFiles,
  formatStdin,
  initContext,
  logResolvedConfigPathOrDie,
  logFileInfoOrDie,
  normalizeDetailedOptionMap
};
