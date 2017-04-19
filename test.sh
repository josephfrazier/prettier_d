#!/usr/bin/env bash
set -euo pipefail # bash "strict mode"

prettier=./bin/prettier.js
prettier_dnc=./bin/prettier_dnc.sh
file=./test/prettier.js

# Restart the server to pick up any changes
$prettier stop
$prettier start

# Grab the required info for netcat
PORT=`cat ~/.prettier_d | cut -d" " -f1`
TOKEN=`cat ~/.prettier_d | cut -d" " -f2`

# Make sure the fixture hasn't changed
md5sum $file | grep f75b2b44fd861a20b69f9a3e1960e419 >/dev/null

# Format it using netcat and make sure the output has been formatted
echo "$TOKEN $PWD $file" | nc localhost $PORT | md5sum | grep 750573a1ced7ec47055a51584e1fcd6e >/dev/null

# Pipe it to netcat and get the same output
cat $file | $prettier_dnc | md5sum | grep 750573a1ced7ec47055a51584e1fcd6e >/dev/null

# Ensure that --list-different prints the filename
($prettier --list-different $file || true) | grep $file >/dev/null

# Format the file, then make sure than --list-different doesn't fail
tmp=.write.test.js
cp $file $tmp && $prettier --write $tmp && $prettier --list-different $tmp && rm $tmp

# Ensure help message shows prettier_d and only one filename
$prettier --help | grep "Usage: prettier_d .opts. .filename.$" >/dev/null

# Ensure --fallback is in the help message
$prettier --help | grep -- "--fallback" >/dev/null
# Ensure --fallback with invalid syntax prints the original input
echo "a.1" | $prettier_dnc --fallback | grep '^a\.1$' >/dev/null
echo "a.1" | $prettier_dnc --fallback | wc -c | grep ' 4$' >/dev/null

# Ensure --json is in the help message
$prettier --help | grep -- "--json" >/dev/null
# Ensure --json formats JSON
echo '{"key":"value"}' | md5sum | grep 707847a2b9a7eb329ff71b84be6085a2 >/dev/null
echo '{"key":"value"}' | $prettier_dnc --json | md5sum | grep c482e72bc3892b16a4c5042a0188433a >/dev/null

# Verify that multiple files are currently not supported
echo "$TOKEN $PWD $file $file" | nc localhost $PORT | md5sum | grep 750573a1ced7ec47055a51584e1fcd6e >/dev/null
