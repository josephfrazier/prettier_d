# prettier\_d

[![SemVer]](http://semver.org)
[![License]](https://github.com/josephfrazier/prettier\_d.js/blob/master/LICENSE)

Makes [prettier] the fastest formatter on the planet.

## "But prettier is pretty fast already, right?"

Yes, it's actually super fast. But the node.js startup time and loading all the
required modules slows down formatting times. `prettier_d` reduces this
overhead by running a server in the background. It brings the formatting time
down. If you want to format from within your editor whenever you save a file,
`prettier_d` is for you.

## Install

This will install the `prettier_d` command globally:

```bash
npm install -g prettier_d
```

## Usage

To start the server and format a file, just run:

```bash
prettier_d file.js
```

On the initial call, the `prettier_d` server is launched and then the given file
is formatted. Subsequent invocations are super fast.

## How does this work?

The first time you use `prettier_d`, a little server is started in the background
and bound to a random port. The port number is stored along with [a
token][change401] in `~/.prettier_d`. You can then run `prettier_d` commands the
same way you would use `prettier` and it will delegate to the background server.
It will load a [separate instance][change220] of prettier for each working
directory to make sure settings are kept local. If prettier is found in the
current working directories `node_modules` folder, then this version of prettier
is going to be used. Otherwise, the version of prettier that ships with
`prettier_d` is used as a fallback.

When you have a lot of projects that use prettier, it might use
quite a bit of ram for cached instances. All memory can be freed up by running
`prettier_d stop` or `prettier_d restart`.

## Commands

Control the server like this:

```bash
prettier_d <command>
```

Available commands:

- `start`: start the server
- `stop`: stop the server
- `status`: print out whether the server is currently running
- `restart`: restart the server
- `[options] file.js` `file.js`: invoke `prettier` with the given options.
  The `prettier` engine will be created in the current directory. If the server
  is not yet running, it is started.

`prettier_d` will select a free port automatically and store the port number
along with an access token in `~/.prettier_d`.

Type `prettier_d --help` to see the supported `prettier` options.
Here are the options supported by the bundled version of `prettier`:

```
Usage: prettier_d [opts] [filename]

Available options:
  --write                  Edit the file in-place. (Beware!)
  --list-different or -l   Print filenames of files that are different from Prettier formatting.
  --stdin                  Read input from stdin.
  --print-width <int>      Specify the length of line that the printer will wrap on. Defaults to 80.
  --tab-width <int>        Specify the number of spaces per indentation-level. Defaults to 2.
  --use-tabs               Indent lines with tabs instead of spaces.
  --no-semi                Do not print semicolons, except at the beginning of lines which may need them.
  --single-quote           Use single quotes instead of double quotes.
  --no-bracket-spacing     Do not print spaces between brackets.
  --jsx-bracket-same-line  Put > on the last line instead of at a new line.
  --trailing-comma <none|es5|all>
                           Print trailing commas wherever possible. Defaults to none.
  --parser <flow|babylon>  Specify which parse to use. Defaults to babylon.
  --no-color               Do not colorize error messages.
  --version or -v          Print Prettier version.


Options specific to prettier_d:
  --fallback               If formatting fails, print the original input. Defaults to false.
  --json                   Try to parse input as JSON and format with json-stable-stringify and json-align. Defaults to false.
  --local-only             Fail if prettier is not in ./node_modules. Defaults to false.
                           If --json is specified, it will still be formatted.
                           If --fallback is specified, the original input will be printed.
  --pkg-conf               Read prettier configuration from nearest package.json to working directory.
                           NOTE: CLI options pertaining to formatting will be ignored.
```

## Editor integration

See https://github.com/prettier/prettier#editor-integration

### Real-time formatting in Vim

If you use Vim, and you'd like `prettier_d` to format your code as you type, install [Neoformat] and add this to your `~/.vimrc`:

```vim
autocmd FileType javascript setlocal formatprg=prettier_dnc\ --local-only\ --pkg-conf\ --fallback
autocmd BufWritePre,TextChanged,InsertLeave *.js Neoformat

" Use formatprg when available
let g:neoformat_try_formatprg = 1
" https://github.com/sbdchd/neoformat/issues/25
let g:neoformat_only_msg_on_error = 1
```

If you're in a repository that has `prettier` in its `node_modules/`, this will format your code:

* before each save
* whenever text is changed in normal mode
* whenever you leave insert mode

The `prettier` configuration is read from `package.json` if available. Otherwise, the default prettier configuration is used. If you'd prefer a different configuration, replace `--pkg-conf` with your own options.

[Neoformat]: https://github.com/sbdchd/neoformat

## Moar speed

If you're really into performance and want the lowest possible latency, talk to
the `prettier_d` server with netcat. This will also eliminate the node.js startup
time.

```bash
PORT=`cat ~/.prettier_d | cut -d" " -f1`
TOKEN=`cat ~/.prettier_d | cut -d" " -f2`
echo "$TOKEN $PWD file.js" | nc localhost $PORT

# You can also pipe a stream in with `--stdin`:
cat file.js | cat <(echo "$TOKEN $PWD --stdin") - | nc localhost $PORT
# `prettier_dnc` is provided as a helper script for this usage:
cat file.js | prettier_dnc
```

This runs `prettier` even faster!

## Compatibility

- `5.0.0`: prettier ^1.0.0

## Limitations

* Multiple files are currently not supported. You can use e.g. `xargs` to work around this: `ls *.js | xargs -n1 prettier_d` 
* The CLI output is not quite the same as `prettier`. Don't worry, the source code formatting still is!

## License

MIT

[SemVer]: http://img.shields.io/:semver-%E2%9C%93-brightgreen.svg
[License]: http://img.shields.io/npm/l/prettier_d.svg
[prettier]: https://github.com/prettier/prettier
[change220]: https://github.com/josephfrazier/prettier_d.js/blob/master/CHANGES.md#220
[change401]: https://github.com/josephfrazier/prettier_d.js/blob/master/CHANGES.md#401
