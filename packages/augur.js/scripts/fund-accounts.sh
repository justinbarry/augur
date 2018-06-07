#!/bin/bash

trap "exit" INT
set -e

export ETHEREUM_DATADIR="$HOME/.ethereum"
export ETHEREUM_KEYSTORE_PATH="${ETHEREUM_DATADIR}/keystore"
export ETHEREUM_HTTP=http://127.0.0.1:8545
export ETHEREUM_WS=ws://127.0.0.1:8546
export ETHEREUM_PASSWORD=$(cat ${ETHEREUM_DATADIR}/.password)
export ETH_FUNDING_PRIVATE_KEY="fae42052f82bed612a724fec3632f325f377120592c75bb78adfcceae6470c5a"

# ETH funding
ETHEREUM_PRIVATE_KEY=${ETH_FUNDING_PRIVATE_KEY} scripts/dp/fund-accounts.js 0x95f75c360c056cf4e617f5ba2d9442706d6d43ed,0x639b41c4d3d399894f2a57894278e1653e7cd24c,0x113b462d14c542d208f5262d82e2eafd7cffd88a,0xbf76e5C1E3A12C96F356E564EB589AB798485c89,0xce492cc2e4c3a36874ee8601b70ef486924ed966,0x470cd8567c88a2fbd71d96e830710a0ee502a6f8,0xaf9f099266bb758d66a347edc2061402fecc4da7

# REP funding
# 0x95f75c360c056cf4e617f5ba2d9442706d6d43ed
scripts/rep-faucet.js ${ETHEREUM_KEYSTORE_PATH}/UTC--2017-11-19T22-11-05.040818570Z--95f75c360c056cf4e617f5ba2d9442706d6d43ed
# 0x113b462d14c542d208f5262d82e2eafd7cffd88a
ETHEREUM_PRIVATE_KEY=$(cat ../keys/deploy_keys/rinkeby.prv) scripts/rep-faucet.js
# 0x639b41c4d3d399894f2a57894278e1653e7cd24c
scripts/rep-faucet.js ${ETHEREUM_KEYSTORE_PATH}/639b41c4d3d399894f2a57894278e1653e7cd24c/639b41c4d3d399894f2a57894278e1653e7cd24c