#!/usr/bin/env bash
set -euo pipefail # bash "strict mode"

prettier=./bin/prettier.js

$prettier stop
$prettier start

PORT=`cat ~/.prettier_d | cut -d" " -f1`
TOKEN=`cat ~/.prettier_d | cut -d" " -f2`

md5sum $prettier | grep f75b2b44fd861a20b69f9a3e1960e419 >/dev/null
echo "$TOKEN $PWD $prettier" | nc localhost $PORT | md5sum | grep 750573a1ced7ec47055a51584e1fcd6e >/dev/null
cat $prettier | cat <(echo "$TOKEN $PWD --stdin") - | nc localhost $PORT | md5sum | grep 750573a1ced7ec47055a51584e1fcd6e >/dev/null
