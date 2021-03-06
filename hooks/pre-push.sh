#!/bin/bash

#you can bypass this hook by `git push --no-verify`

set -e #exit immediately on `exit status > 0` of any command
set -o pipefail #exit immediately on `exit status > 0` for pipes

lerna run lint --since master;
lerna run test  --since master --include-filtered-dependents
