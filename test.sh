#!/usr/bin/env bash
set -euo pipefail # bash "strict mode"

prettier=./bin/prettier.js
prettier_dnc=./bin/prettier_dnc.sh
file=./test/prettier.js

$prettier stop
$prettier start

PORT=`cat ~/.prettier_d | cut -d" " -f1`
TOKEN=`cat ~/.prettier_d | cut -d" " -f2`

md5sum $file | grep f75b2b44fd861a20b69f9a3e1960e419 >/dev/null
echo "$TOKEN $PWD $file" | nc localhost $PORT | md5sum | grep 750573a1ced7ec47055a51584e1fcd6e >/dev/null
cat $file | $prettier_dnc | md5sum | grep 750573a1ced7ec47055a51584e1fcd6e >/dev/null
($prettier --list-different $file || true) | grep $file >/dev/null

tmp=.write.test.js
cp $file $tmp && $prettier --write $tmp && $prettier --list-different $tmp && rm $tmp

$prettier --help | grep "Usage: prettier_d .opts. .filename.$" >/dev/null
$prettier --help | grep -- "--fallback" >/dev/null
$prettier --help | grep -- "--json" >/dev/null
echo "$TOKEN $PWD $file $file" | nc localhost $PORT | md5sum | grep 750573a1ced7ec47055a51584e1fcd6e >/dev/null
