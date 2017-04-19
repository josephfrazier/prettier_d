#!/usr/bin/env bash
PORT=`cat ~/.prettier_d | cut -d" " -f1`
TOKEN=`cat ~/.prettier_d | cut -d" " -f2`
cat <(echo "$TOKEN $PWD --stdin --fallback --json --print-width 80 --tab-width 2 --single-quote --trailing-comma es5 --bracket-spacing --no-semi") - | nc localhost $PORT
