import { BigDecimal, BigInt, Bytes, Address } from "@graphprotocol/graph-ts";
import {
  OrderFilled,
  OrdersMatched,
  TokenRegistered,
} from "../generated/NegRiskExchangeV1/Exchange";
import { NegRiskMarket, Trade, Condition, MarketDailySnapshot, GlobalDailySnapshot, TokenToMarket } from "../generated/schema";
import {
  ZERO_BI,
  ONE_BI,
  ZERO_BD,
  toUSD,
  getVenueFromAddress,
  getOrCreateUser,
  getOrCreateGlobalStats,
} from "./helpers";

export function handleTokenRegistered(event: TokenRegistered): void {
  let conditionId = event.params.conditionId;
  let market = NegRiskMarket.load(conditionId);

  if (market == null) {
    market = new NegRiskMarket(conditionId);
    market.condition = conditionId;
    market.token0 = event.params.token0;
    market.token1 = event.params.token1;
    market.venue = getVenueFromAddress(event.address);
    market.tradesCount = ZERO_BI;
    market.buysCount = ZERO_BI;
    market.sellsCount = ZERO_BI;
    market.volumeUSD = ZERO_BD;
    market.buyVolumeUSD = ZERO_BD;
    market.sellVolumeUSD = ZERO_BD;
    market.feesUSD = ZERO_BD;
    market.createdAt = event.block.timestamp;
    market.createdTx = event.transaction.hash;
    market.save();

    // Create token→market lookups for both token0 and token1
    let lookup0 = new TokenToMarket(changetype<Bytes>(Bytes.fromBigInt(event.params.token0)));
    lookup0.market = conditionId;
    lookup0.save();

    let lookup1 = new TokenToMarket(changetype<Bytes>(Bytes.fromBigInt(event.params.token1)));
    lookup1.market = conditionId;
    lookup1.save();

    let condition = Condition.load(conditionId);
    if (condition != null) {
      condition.market = conditionId;
      condition.save();
    }

    let stats = getOrCreateGlobalStats();
    stats.totalMarkets += 1;
    stats.save();
  }
}

export function handleOrderFilled(event: OrderFilled): void {
  let venue = getVenueFromAddress(event.address);
  let maker = getOrCreateUser(event.params.maker);
  let taker = getOrCreateUser(event.params.taker);

  let makerAmountFilled = event.params.makerAmountFilled;
  let takerAmountFilled = event.params.takerAmountFilled;
  let fee = event.params.fee;

  let collateralAmount = makerAmountFilled.gt(takerAmountFilled)
    ? takerAmountFilled
    : makerAmountFilled;
  let amountUSD = toUSD(collateralAmount);
  let feeUSD = toUSD(fee);

  let price = ZERO_BD;
  if (makerAmountFilled.gt(ZERO_BI) && takerAmountFilled.gt(ZERO_BI)) {
    price = takerAmountFilled.toBigDecimal().div(makerAmountFilled.toBigDecimal());
  }

  let tradeType = makerAmountFilled.le(takerAmountFilled) ? "BUY" : "SELL";

  let tradeId = event.transaction.hash.concatI32(event.logIndex.toI32());
  let trade = new Trade(tradeId);
  trade.orderHash = event.params.orderHash;
  trade.maker = maker.id;
  trade.taker = taker.id;
  trade.type = tradeType;
  trade.makerAssetId = event.params.makerAssetId;
  trade.takerAssetId = event.params.takerAssetId;
  trade.makerAmountFilled = makerAmountFilled;
  trade.takerAmountFilled = takerAmountFilled;
  trade.amountUSD = amountUSD;
  trade.fee = fee;
  trade.feeUSD = feeUSD;
  trade.price = price;
  trade.venue = venue;
  trade.blockNumber = event.block.number;
  trade.timestamp = event.block.timestamp;
  trade.txHash = event.transaction.hash;

  let outcomeTokenId = tradeType == "BUY"
    ? event.params.takerAssetId
    : event.params.makerAssetId;
  let tokenKey = changetype<Bytes>(Bytes.fromBigInt(outcomeTokenId));
  let lookup = TokenToMarket.load(tokenKey);
  let marketId = lookup ? lookup.market : tokenKey;
  trade.market = marketId;
  trade.save();

  // Update user stats
  maker.tradesCount = maker.tradesCount.plus(ONE_BI);
  maker.totalVolumeUSD = maker.totalVolumeUSD.plus(amountUSD);
  maker.totalFeesUSD = maker.totalFeesUSD.plus(feeUSD);
  maker.lastTradeAt = event.block.timestamp;
  if (maker.firstTradeAt === null) {
    maker.firstTradeAt = event.block.timestamp;
  }
  maker.save();

  taker.lastTradeAt = event.block.timestamp;
  taker.save();

  // Update market stats
  let market = NegRiskMarket.load(marketId);
  if (market != null) {
    market.tradesCount = market.tradesCount.plus(ONE_BI);
    market.volumeUSD = market.volumeUSD.plus(amountUSD);
    market.feesUSD = market.feesUSD.plus(feeUSD);
    if (tradeType == "BUY") {
      market.buysCount = market.buysCount.plus(ONE_BI);
      market.buyVolumeUSD = market.buyVolumeUSD.plus(amountUSD);
    } else {
      market.sellsCount = market.sellsCount.plus(ONE_BI);
      market.sellVolumeUSD = market.sellVolumeUSD.plus(amountUSD);
    }
    market.save();

    let dayId = event.block.timestamp.toI32() / 86400;
    let snapshotId = market.id.concatI32(dayId);
    let snapshot = MarketDailySnapshot.load(snapshotId);
    if (snapshot == null) {
      snapshot = new MarketDailySnapshot(snapshotId);
      snapshot.market = market.id;
      snapshot.dayId = dayId;
      snapshot.date = BigInt.fromI32(dayId * 86400);
      snapshot.tradesCount = ZERO_BI;
      snapshot.volumeUSD = ZERO_BD;
      snapshot.buyVolumeUSD = ZERO_BD;
      snapshot.sellVolumeUSD = ZERO_BD;
      snapshot.feesUSD = ZERO_BD;
    }
    snapshot.tradesCount = snapshot.tradesCount.plus(ONE_BI);
    snapshot.volumeUSD = snapshot.volumeUSD.plus(amountUSD);
    snapshot.feesUSD = snapshot.feesUSD.plus(feeUSD);
    if (tradeType == "BUY") {
      snapshot.buyVolumeUSD = snapshot.buyVolumeUSD.plus(amountUSD);
    } else {
      snapshot.sellVolumeUSD = snapshot.sellVolumeUSD.plus(amountUSD);
    }
    snapshot.save();
  }

  // Update global stats
  let stats = getOrCreateGlobalStats();
  stats.totalTradesCount = stats.totalTradesCount.plus(ONE_BI);
  stats.totalVolumeUSD = stats.totalVolumeUSD.plus(amountUSD);
  stats.totalFeesUSD = stats.totalFeesUSD.plus(feeUSD);
  stats.save();

  let dayId = event.block.timestamp.toI32() / 86400;
  let globalSnapshotId = Bytes.fromI32(dayId);
  let globalSnapshot = GlobalDailySnapshot.load(globalSnapshotId);
  if (globalSnapshot == null) {
    globalSnapshot = new GlobalDailySnapshot(globalSnapshotId);
    globalSnapshot.dayId = dayId;
    globalSnapshot.date = BigInt.fromI32(dayId * 86400);
    globalSnapshot.totalTradesCount = ZERO_BI;
    globalSnapshot.totalVolumeUSD = ZERO_BD;
    globalSnapshot.totalFeesUSD = ZERO_BD;
    globalSnapshot.totalSplits = ZERO_BI;
    globalSnapshot.totalMerges = ZERO_BI;
    globalSnapshot.totalRedemptions = ZERO_BI;
  }
  globalSnapshot.totalTradesCount = globalSnapshot.totalTradesCount.plus(ONE_BI);
  globalSnapshot.totalVolumeUSD = globalSnapshot.totalVolumeUSD.plus(amountUSD);
  globalSnapshot.totalFeesUSD = globalSnapshot.totalFeesUSD.plus(feeUSD);
  globalSnapshot.save();
}

export function handleOrdersMatched(event: OrdersMatched): void {
  // Individual fills captured by handleOrderFilled
}
