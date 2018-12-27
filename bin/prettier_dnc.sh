#!/usr/bin/env bash

IFS=' ' read PORT TOKEN < ~/.prettier_d

if nc 2>&1 | grep -- -q >/dev/null; then
  NC_OPTIONS="-q 0"
else
  NC_OPTIONS=""
fi

cat <(echo "$TOKEN $PWD --stdin $@") - | nc $NC_OPTIONS 127.0.0.1 $PORT | jq --raw-output --join-output .stdout
