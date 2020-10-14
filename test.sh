#!/usr/bin/env bash
set -xeuo pipefail # bash "strict mode"

pushd test >/dev/null

prettier=../bin/prettier_d.js
file=./prettier.js

# Restart the server to pick up any changes
$prettier stop
$prettier start

# Make sure the fixture hasn't changed
md5sum $file | grep f75b2b44fd861a20b69f9a3e1960e419 >/dev/null

# Format it using stdin and make sure the output has been formatted
cat $file | $prettier --parser babel | md5sum | grep 750573a1ced7ec47055a51584e1fcd6e >/dev/null

# Try a different stdin and make sure the output is different
cat ./install-service-worker.js | $prettier --parser babel | md5sum | grep d85209acfe81f406233068b6530c86aa >/dev/null

# Ensure that --list-different prints the filename
($prettier --list-different $file || true) | grep $(basename $file) >/dev/null

# Format the file, then make sure than --list-different doesn't fail
tmp=.write.test.js
cp $file $tmp && $prettier --write $tmp && $prettier --list-different $tmp | wc -c | grep '\<0$' >/dev/null && rm $tmp

# Verify that multiple files are supported
$prettier $file ./install-service-worker.js | md5sum | grep 3a35d94b8e9c752581de57aaecd86862 >/dev/null

popd >/dev/null
