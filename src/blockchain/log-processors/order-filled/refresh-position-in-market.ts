import * as Knex from "knex";
import { convertNumTicksToTickSize } from "../../../utils/convert-fixed-point-to-decimal";
import { Augur } from "augur.js";
import { Address, MarketsRow } from "../../../types";
import { upsertPositionInMarket } from "./upsert-position-in-market";

export function refreshPositionInMarket(db: Knex, augur: Augur, trx: Knex.Transaction, marketID: Address, account: Address, callback: (err: Error|null, positions?: Array<string>) => void) {
  trx.first("minPrice", "maxPrice", "numTicks", "category").from("markets").where({ marketID }).asCallback((err: Error|null, marketsRow?: Partial<MarketsRow>): void => {
    if (err) return callback(err);
    if (!marketsRow) return callback(new Error("market min price, max price, and/or num ticks not found"));
    const minPrice = marketsRow.minPrice!;
    const maxPrice = marketsRow.maxPrice!;
    const numTicks = marketsRow.numTicks!;
    const tickSize = convertNumTicksToTickSize(numTicks, minPrice, maxPrice);
    augur.trading.getPositionInMarket({
      market: marketID,
      address: account,
      tickSize,
    }, (err: Error|null, positions: Array<string>): void => {
      if (err) return callback(err);
      upsertPositionInMarket(db, augur, trx, account, marketID, numTicks, positions, (err: Error|null) => {
        if (err) return callback(err);
        callback(err, positions);
      });
    });
  });
}
