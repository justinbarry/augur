"use strict";

var BigNumber = require("bignumber.js");
var chalk = require("chalk");
var speedomatic = require("speedomatic");
var printTransactionStatus = require("./print-transaction-status");
var debugOptions = require("../../debug-options");

var USE_PUBLIC_CREATE_ORDER = false; // set to false to test trading.placeTrade endpoint

function createOrder(augur, marketId, outcome, numOutcomes, maxPrice, minPrice, numTicks, orderType, order, tradeGroupId, auth, callback) {
  var normalizedPrice = augur.trading.normalizePrice({ price: order.price, maxPrice: maxPrice, minPrice: minPrice });
  var tickSize = (new BigNumber(maxPrice, 10).minus(new BigNumber(minPrice, 10))).dividedBy(new BigNumber(numTicks, 10)).toFixed();
  var orderTypeCode = orderType === "buy" ? 0 : 1;
  var tradeCost = augur.trading.calculateTradeCost({
    normalizedPrice: normalizedPrice,
    amount: order.shares,
    tickSize: tickSize,
    numTicks: numTicks,
    orderType: orderTypeCode,
  });
  if (debugOptions.cannedMarkets) {
    console.log("price:", order.price, normalizedPrice, tradeCost.adjustedPrice);
    console.log("numTicks:", numTicks);
    console.log("on chain shares:", new BigNumber(tradeCost.onChainAmount, 16).toFixed());
    console.log(chalk.green.bold("cost:"), chalk.cyan(speedomatic.unfix(new BigNumber(tradeCost.cost, 16), "string")), chalk.cyan.dim("ETH"));
  }
  if (USE_PUBLIC_CREATE_ORDER) {
    augur.trading.getBetterWorseOrders({
      orderType: orderType,
      marketId: marketId,
      outcome: outcome,
      price: order.price,
    }, function (err, betterWorseOrders) {
      if (err) betterWorseOrders = { betterOrderId: "0x0", worseOrderId: "0x0" };
      var publicCreateOrderPayload = {
        meta: auth,
        tx: { value: tradeCost.cost, gas: augur.constants.CREATE_ORDER_GAS },
        _type: orderTypeCode,
        _attoshares: tradeCost.onChainAmount,
        _displayPrice: tradeCost.adjustedPrice,
        _market: marketId,
        _outcome: outcome,
        _betterOrderId: (betterWorseOrders || {}).betterOrderId || "0x0",
        _worseOrderId: (betterWorseOrders || {}).worseOrderId || "0x0",
        _tradeGroupId: tradeGroupId,
        onSent: function (res) {
          if (debugOptions.cannedMarkets) {
            console.log(chalk.green.dim("publicCreateOrder sent:"), chalk.green(res.hash), chalk.cyan.dim(JSON.stringify(order)));
          }
        },
        onSuccess: function (res) {
          if (debugOptions.cannedMarkets) {
            console.log(chalk.green.dim("publicCreateOrder success:"), chalk.green(res.callReturn), chalk.cyan.dim(JSON.stringify(order)));
          }
          printTransactionStatus(augur.rpc, (res || {}).hash, function (err) {
            if (err) return callback(err);
            callback(null, res);
          });
        },
        onFailed: function (err) {
          if (debugOptions.cannedMarkets) {
            console.log(chalk.red.bold("publicCreateOrder failed:"), err, chalk.cyan.dim(JSON.stringify(order)));
          }
          printTransactionStatus(augur.rpc, (err || {}).hash, function (e) {
            if (e) return callback(e);
            callback(err);
          });
        },
      };
      console.log("publicCreateOrder payload:", publicCreateOrderPayload);
      augur.api.CreateOrder.publicCreateOrder(publicCreateOrderPayload);
    });
  } else {
    var placeTradeParams = {
      meta: auth,
      amount: order.shares,
      limitPrice: order.price,
      // estimatedCost: speedomatic.unfix(tradeCost.cost, "string"),
      minPrice: minPrice,
      maxPrice: maxPrice,
      tickSize: tickSize,
      numTicks: numTicks,
      _direction: orderTypeCode,
      _market: marketId,
      _outcome: outcome,
      _tradeGroupId: tradeGroupId,
      doNotCreateOrders: false,
      onSent: function (res) {
        if (debugOptions.cannedMarkets) console.log(chalk.green.dim("placeTrade sent:"), res);
      },
      onSuccess: function (tradeOnChainAmountRemaining) {
        if (debugOptions.cannedMarkets) console.log(chalk.green.dim("placeTrade success:"), tradeOnChainAmountRemaining);
        callback(null);
      },
      onFailed: function (err) {
        if (debugOptions.cannedMarkets) console.error(chalk.red.bold("placeTrade failed:"), err);
        callback(err);
      },
    };
    if (debugOptions.cannedMarkets) console.log("create-order placeTradeParams:", placeTradeParams);
    augur.trading.placeTrade(placeTradeParams);
  }
}

module.exports = createOrder;
