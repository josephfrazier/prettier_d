# TODO

* Make it possible to pipe input to server through netcat
  * This will allow a Vim formatprg to use netcat without a temp file
  * Will probably need to use `--` to indicate that arguments have stopped
  * Usage will look something like this:

    `(echo -n "$TOKEN $PWD --stdin --otherOptions -- "; cat) | nc localhost $PORT`
* Improve --help message
  * Document extra options
    * --fallback
    * --json
* Support all prettier options
  * --write
  * --list-different
  * --color
* Figure out how to use prettier's test cases?
