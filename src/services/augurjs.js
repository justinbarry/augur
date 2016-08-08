import augur from 'augur.js';
import BigNumber from 'bignumber.js';
import { SUCCESS, SIMULATED_ORDER_BOOK, COMPLETE_SET_BOUGHT, ORDER_BOOK_ORDER_COMPLETE, ORDER_BOOK_OUTCOME_COMPLETE } from '../modules/transactions/constants/statuses';

const TIMEOUT_MILLIS = 50;
const ex = {};

ex.connect = function connect(env, cb) {
	const options = {
		http: env.gethHttpURL,
		ws: env.gethWebsocketsURL,
		contracts: env.contracts
	};
	if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
		const isEnvHttps = (env.gethHttpURL && env.gethHttpURL.split('//')[0] === 'https:');
		const isEnvWss = (env.gethWebsocketsURL && env.gethWebsocketsURL.split('//')[0] === 'wss:');
		if (!isEnvHttps) options.http = null;
		if (!isEnvWss) options.ws = null;
	}
	if (options.http) augur.rpc.nodes.hosted = [options.http];
	augur.rpc.retryDroppedTxs = env.retryDroppedTxs;
	augur.connect(options, (connection) => {
		if (!connection) return cb('could not connect to ethereum');
		console.log('connected:', connection);
		cb(null, connection);
	});
};

ex.loadBranch = function loadBranch(branchID, cb) {
	const branch = { id: branchID };
	function finish() {
		if (branch.periodLength && branch.description) {
			cb(null, branch);
		}
	}
	augur.getPeriodLength(branchID, periodLength => {
		if (!periodLength || periodLength.error) {
			console.info('ERROR getPeriodLength', periodLength);
			return cb(periodLength);
		}
		branch.periodLength = periodLength;
		finish();
	});
	augur.getDescription(branchID, description => {
		if (!description || description.error) {
			console.info('ERROR getDescription', description);
			return cb(description);
		}
		branch.description = description;
		finish();
	});
};

ex.loadLoginAccount = function loadLoginAccount(env, cb) {
	const localStorageRef = typeof window !== 'undefined' && window.localStorage;

	// if available, use the client-side account
	if (augur.web.account.address && augur.web.account.privateKey) {
		console.log('using client-side account:', augur.web.account.address);
		return cb(null, {
			...augur.web.account,
			id: augur.web.account.address
		});
	}
	// if the user has a persistent login, use it
	if (localStorageRef && localStorageRef.getItem && localStorageRef.getItem('account')) {
		const account = JSON.parse(localStorageRef.getItem('account'));
		if (account && account.privateKey) {
			// local storage account exists, load it spawn the callback using augur.web.account
			augur.web.loadLocalLoginAccount(account, (loginAccount) =>
				cb(null, {
					...augur.web.account,
					id: augur.web.account.address
				})
			);
			//	break out of ex.loadLoginAccount as we don't want to login the local geth node.
			return;
		}
	}

	// Short circuit if autologin disabled in env.json
	if (!env.autoLogin) {
		return cb(null);
	}

	// local node: if it's unlocked, use the coinbase account
	// check to make sure the account is unlocked
	augur.rpc.unlocked(augur.from, (unlocked) => {

		// use augur.from address if unlocked
		if (unlocked && !unlocked.error) {
			augur.web.logout();
			console.log('using unlocked account:', augur.from);
			return cb(null, { id: augur.from });
		}

		// otherwise, no account available
		console.log('account is locked: ', augur.from);
		return cb(null);
	});
};

ex.loadAssets = function loadAssets(branchID, accountID, cbEther, cbRep, cbRealEther) {
	augur.getCashBalance(accountID, (result) => {
		if (!result || result.error) {
			return cbEther(result);
		}
		return cbEther(null, augur.abi.number(result));
	});
	augur.getRepBalance(branchID, accountID, (result) => {
		if (!result || result.error) {
			return cbRep(result);
		}
		return cbRep(null, augur.abi.number(result));
	});
	augur.rpc.balance(accountID, (wei) => {
		if (!wei || wei.error) {
			return cbRealEther(wei);
		}
		return cbRealEther(null, augur.abi.bignum(wei).dividedBy(new BigNumber(10).toPower(18)).toNumber());
	});
};

ex.loadMarkets = function loadMarkets(branchID, chunkSize, isDesc, chunkCB) {

	// load the total number of markets
	augur.getNumMarketsBranch(branchID, numMarketsRaw => {
		const numMarkets = parseInt(numMarketsRaw, 10);
		const firstStartIndex = isDesc ? Math.max(numMarkets - chunkSize + 1, 0) : 0;

		// load markets in batches
		getMarketsInfo(branchID, firstStartIndex, chunkSize, numMarkets, isDesc);
	});

	// load each batch of marketdata sequentially and recursively until complete
	function getMarketsInfo(branchID, startIndex, chunkSize, numMarkets, isDesc) {
		augur.getMarketsInfo({
			branch: branchID,
			offset: startIndex,
			numMarketsToLoad: chunkSize
		}, marketsData => {
			if (!marketsData || marketsData.error) {
				chunkCB(marketsData);
			} else {
				chunkCB(null, marketsData);
			}

			if (isDesc && startIndex > 0) {
				setTimeout(() => getMarketsInfo(branchID, Math.max(startIndex - chunkSize, 0), chunkSize, numMarkets, isDesc), TIMEOUT_MILLIS);
			} else if (!isDesc && startIndex < numMarkets) {
				setTimeout(() => getMarketsInfo(branchID, startIndex + chunkSize, chunkSize, numMarkets, isDesc), TIMEOUT_MILLIS);
			}
		});
	}
};

ex.loadAccountTrades = function loadAccountTrades(accountID, cb) {
	augur.getAccountTrades(accountID, null, (accountTrades) => {
		if (accountTrades && accountTrades.error) {
			return cb(accountTrades.error);
		}
		return cb(null, accountTrades);
	});
};

ex.login = function login(secureLoginID, password, cb) {
	augur.web.login(secureLoginID, password, (account) => {
		console.log(account);
		if (!account) {
			return cb({ code: 0, message: 'failed to login' });
		}
		if (account.error) {
			return cb({ code: account.error, message: account.message });
		}
		return cb(null, {
			...account,
			id: account.address
		});
	});
};

ex.logout = function logout() {
	augur.web.logout();
};

ex.register = function register(name, password, cb) {
	augur.web.register(name, password,
		account => {
			console.log(account);
			if (!account) {
				return cb({ code: 0, message: 'failed to register' });
			}
			if (account.error) {
				return cb({ code: account.error, message: account.message });
			}
			return cb(null, {
				...account,
				id: account.address
			});
		});
};

ex.importAccount = function importAccount(name, password, keystore, cb) {
	augur.web.importAccount(name, password, keystore, account => {
		console.log(account);
		if (!account) {
			return cb({ code: 0, message: 'failed to register' });
		}
		if (account.error) {
			return cb({ code: account.error, message: account.message });
		}
		return cb(null, {
			...account,
			id: account.address
		});
	});
};

ex.loadMeanTradePrices = function loadMeanTradePrices(accountID, cb) {
	if (!accountID) {
		cb('AccountID required');
	}
	augur.getAccountMeanTradePrices(accountID, meanTradePrices => {
		if (meanTradePrices && meanTradePrices.error) {
			return cb(meanTradePrices);
		}
		cb(null, meanTradePrices);
	});
};

ex.loadPriceHistory = function loadPriceHistory(marketID, cb) {
	if (!marketID) {
		return cb('ERROR: loadPriceHistory() marketID required');
	}
	augur.getMarketPriceHistory(marketID, (priceHistory) => {
		if (priceHistory && priceHistory.error) {
			return cb(priceHistory.error);
		}
		cb(null, priceHistory);
	});
};

ex.generateOrderBook = function generateOrderBook(marketData, cb) {
	augur.generateOrderBook({
		market: marketData.id,
		liquidity: marketData.initialLiquidity,
		initialFairPrices: marketData.initialFairPrices.raw,
		startingQuantity: marketData.startingQuantity,
		bestStartingQuantity: marketData.bestStartingQuantity,
		priceWidth: marketData.priceWidth,
		isSimulation: marketData.isSimulation,
		onSimulate: r => cb(null, { status: SIMULATED_ORDER_BOOK, payload: r }),
		onBuyCompleteSets: r => cb(null, { status: COMPLETE_SET_BOUGHT, payload: r }),
		onSetupOutcome: r => cb(null, { status: ORDER_BOOK_OUTCOME_COMPLETE, payload: r }),
		onSetupOrder: r => cb(null, { status: ORDER_BOOK_ORDER_COMPLETE, payload: r }),
		onSuccess: r => cb(null, { status: SUCCESS, payload: r }),
		onFailed: err => cb(err)
	});
};

// Setup a new branch and prep it for reporting tests:
// Add markets + events to it, trade in the markets, hit the Rep faucet
// (Note: requires augur.options.debug.tools = true and access to the rpc.personal API)
ex.reportingTestSetup = function reportingTestSetup(periodLen, cb) {
	const tools = augur.tools;
	const constants = augur.constants;
	const sender = augur.web.account.address || augur.from;
	const periodLength = periodLen || 900;
	const callback = cb || function callback(e, r) {
		if (e) console.error(e);
		if (r) console.log(r);
	};
	const accounts = augur.rpc.accounts();
	tools.DEBUG = true;
	tools.setup_new_branch(augur, periodLength, constants.DEFAULT_BRANCH_ID, [sender], (err, newBranchID) => {
		if (err) return callback(err);

		// create an event (and market) of each type on the new branch
		const t = new Date().getTime() / 1000;
		const untilNextPeriod = periodLength - (parseInt(t, 10) % periodLength);
		const expDate = parseInt(t + untilNextPeriod + 1, 10);
		const expirationPeriod = Math.floor(expDate / periodLength);
		console.debug('\nCreating events/markets...');
		console.log('Next period starts at time', parseInt(t, 10) + untilNextPeriod + ' (' + untilNextPeriod + ' seconds to go)');
		console.log('Current timestamp:', parseInt(t, 10));
		console.log('Expiration time:  ', expDate);
		console.log('Expiration period:', expirationPeriod);
		cb(null, 1, newBranchID);
		tools.create_each_market_type(augur, newBranchID, expDate, (err, markets) => {
			if (err) return callback(err);
			cb(null, 2);
			const events = {};
			let type;
			for (type in markets) {
				if (!markets.hasOwnProperty(type)) continue;
				events[type] = augur.getMarketEvent(markets[type], 0);
			}
			const eventID = events.binary;
			console.debug('Binary event:', events.binary);
			console.debug('Categorical event:', events.categorical);
			console.debug('Scalar event:', events.scalar);

			// make a single trade in each new market
			const password = process.env.GETH_PASSWORD;
			tools.top_up(augur, newBranchID, accounts, password, (err, unlocked) => {
				if (err) return callback(err);
				console.log('Unlocked:', unlocked);
				tools.trade_in_each_market(augur, 1, markets, unlocked[0], unlocked[1], password, (err) => {
					if (err) return callback(err);
					cb(null, 3);

					// wait until the period after the new events expire
					tools.wait_until_expiration(augur, events.binary, (err) => {
						if (err) return callback(err);
						callback(null, 4);
						const periodLength = augur.getPeriodLength(augur.getBranch(eventID));
						const expirationPeriod = Math.floor(augur.getExpiration(eventID) / periodLength);
						tools.print_reporting_status(augur, eventID, 'Wait complete');
						console.log('Current period:', augur.getCurrentPeriod(periodLength));
						console.log('Expiration period + 1:', expirationPeriod + 1);
						callback(null, 5);

						// wait for second period to start
						tools.top_up(augur, newBranchID, unlocked, password, (err, unlocked) => {
							if (err) console.error('top_up failed:', err);
							augur.checkVotePeriod(newBranchID, periodLength, (err, votePeriod) => {
								if (err) console.error('checkVotePeriod failed:', err);
								callback(null, 6);
								tools.print_reporting_status(augur, eventID, 'After checkVotePeriod');
								augur.checkTime(newBranchID, eventID, periodLength, (err) => {
									if (err) console.error('checkTime failed:', err);
									callback(null, 7);
								});
							});
						});
					});
				});
			});
		});
	});
};

ex.penalizationCatchup = function penalizationCatchup(branchID, cb) {
	augur.penalizationCatchup({
		branch: branchID,
		onSent: res => {
			console.log('penalizationCatchup sent:', res);
		},
		onSuccess: res => {
			console.log('penalizationCatchup success:', res);
			cb(null, res);
		},
		onFailed: err => {
			console.error('penalizationCatchup failed:', err);
			if (err.error === '0') { // already caught up
				return cb(null);
			}
			cb(err);
		}
	});
};

ex.penalizeWrong = function penalizeWrong(branchID, event, cb) {
	augur.getMarkets(event, markets => {
		if (!markets || markets.error) return console.error('getMarkets:', markets);
		augur.getOutcome(event, outcome => {
			if (outcome !== '0' && !outcome.error) {
				console.log('Calling penalizeWrong for:', branchID, event);
				augur.penalizeWrong({
					branch: branchID,
					event,
					onSent: res => {
						console.log(`penalizeWrong sent for event ${event}`, res);
					},
					onSuccess: res => {
						console.log(`penalizeWrong success for event ${event}`, res);
						cb(null, res);
					},
					onFailed: err => {
						console.error(`penalizeWrong failed for event ${event}`, err);
						cb(err);
					}
				});
			} else {
				self.closeMarket(branchID, markets[0], (err, res) => {
					if (err) return cb(err);
					self.penalizeWrong(branchID, event, cb);
				});
			}
		});
	});
};

ex.closeMarket = function closeMarket(branchID, marketID, cb) {
	augur.closeMarket({
		branch: branchID,
		market: marketID,
		sender: augur.web.account.address || augur.from,
		onSent: res => {
			console.log('closeMarket sent:', res);
		},
		onSuccess: res => {
			console.log('closeMarket success:', res);
			cb(null, res);
		},
		onFailed: err => {
			console.error('closeMarket error:', err);
			cb(err);
		}
	});
};

ex.collectFees = function collectFees(branchID, cb) {
	augur.getPeriodLength(branchID, periodLength => {
		augur.collectFees({
			branch: branchID,
			sender: augur.web.account.address || augur.from,
			periodLength,
			onSent: res => {
			},
			onSuccess: res => {
				cb(null, res);
			},
			onFailed: err => {
				cb(err);
			}
		});
	});
};

ex.fundNewAccount = function fundNewAccount(env, toAddress, branchID, onSent, onSuccess, onFailed) {
	if (env.fundNewAccountFromAddress && env.fundNewAccountFromAddress.amount) {
		augur.web.fundNewAccountFromAddress(env.fundNewAccountFromAddress.address || augur.from, env.fundNewAccountFromAddress.amount, toAddress, branchID, onSent, onSuccess, onFailed);
	} else {
		augur.web.fundNewAccountFromFaucet(toAddress, branchID, onSent, onSuccess, onFailed);
	}
};

ex.changeAccountName = function changeAccountName(name, cb) {
	augur.web.changeAccountName(name, account => {
		if (!account) {
			return cb({ code: 0, message: 'failed to edit account name' });
		}
		return cb(null, { ...account, id: account.address });
	});
};

ex.getTradingActions = augur.getTradingActions;
ex.trade = augur.trade;
ex.buy = augur.buy;
ex.augur = augur;

module.exports = ex;
