#!/usr/bin/env bash
PORT=`cat ~/.prettier_d | cut -d" " -f1`
TOKEN=`cat ~/.prettier_d | cut -d" " -f2`
if nc 2>&1 | grep -- -q >/dev/null; then
  cat <(echo "$TOKEN $PWD --stdin $@") - | nc -q 0 localhost $PORT
else
  cat <(echo "$TOKEN $PWD --stdin $@") - | nc      localhost $PORT
fi
