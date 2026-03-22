import { BigInt, Bytes, Address } from "@graphprotocol/graph-ts";
import {
  ConditionPreparation,
  ConditionResolution,
  PositionSplit,
  PositionsMerge,
  PayoutRedemption,
  TransferSingle,
  TransferBatch,
} from "../generated/CTF/CTF";
import { Condition, Split, Merge, Redemption, UserPosition, TokenToMarket, GlobalDailySnapshot } from "../generated/schema";
import {
  ZERO_BI,
  ONE_BI,
  ZERO_BD,
  toUSD,
  getOrCreateUser,
  getOrCreateGlobalStats,
} from "./helpers";

let ZERO_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000000");

export function handleConditionPreparation(event: ConditionPreparation): void {
  let id = event.params.conditionId;
  let condition = new Condition(id);
  condition.oracle = event.params.oracle;
  condition.questionId = event.params.questionId;
  condition.outcomeSlotCount = event.params.outcomeSlotCount.toI32();
  condition.resolved = false;
  condition.createdAt = event.block.timestamp;
  condition.createdTx = event.transaction.hash;
  condition.save();
}

export function handleConditionResolution(event: ConditionResolution): void {
  let condition = Condition.load(event.params.conditionId);
  if (condition == null) return;

  condition.resolved = true;
  condition.payoutNumerators = event.params.payoutNumerators;
  condition.resolvedAt = event.block.timestamp;
  condition.resolvedTx = event.transaction.hash;
  condition.save();

  if (condition.market !== null) {
    let stats = getOrCreateGlobalStats();
    stats.resolvedMarkets += 1;
    stats.save();
  }
}

export function handlePositionSplit(event: PositionSplit): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let user = getOrCreateUser(event.params.stakeholder);
  let amountUSD = toUSD(event.params.amount);

  let split = new Split(id);
  split.stakeholder = user.id;
  split.conditionId = event.params.conditionId;
  split.collateralToken = event.params.collateralToken;
  split.amount = event.params.amount;
  split.amountUSD = amountUSD;
  split.timestamp = event.block.timestamp;
  split.txHash = event.transaction.hash;
  split.save();

  let stats = getOrCreateGlobalStats();
  stats.totalSplits = stats.totalSplits.plus(ONE_BI);
  stats.save();

  let dayId = event.block.timestamp.toI32() / 86400;
  let snapId = Bytes.fromI32(dayId);
  let snap = GlobalDailySnapshot.load(snapId);
  if (snap == null) {
    snap = new GlobalDailySnapshot(snapId);
    snap.dayId = dayId;
    snap.date = BigInt.fromI32(dayId * 86400);
    snap.totalTradesCount = ZERO_BI;
    snap.totalVolumeUSD = ZERO_BD;
    snap.totalFeesUSD = ZERO_BD;
    snap.totalSplits = ZERO_BI;
    snap.totalMerges = ZERO_BI;
    snap.totalRedemptions = ZERO_BI;
  }
  snap.totalSplits = snap.totalSplits.plus(ONE_BI);
  snap.save();
}

export function handlePositionsMerge(event: PositionsMerge): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let user = getOrCreateUser(event.params.stakeholder);
  let amountUSD = toUSD(event.params.amount);

  let merge = new Merge(id);
  merge.stakeholder = user.id;
  merge.conditionId = event.params.conditionId;
  merge.collateralToken = event.params.collateralToken;
  merge.amount = event.params.amount;
  merge.amountUSD = amountUSD;
  merge.timestamp = event.block.timestamp;
  merge.txHash = event.transaction.hash;
  merge.save();

  let stats = getOrCreateGlobalStats();
  stats.totalMerges = stats.totalMerges.plus(ONE_BI);
  stats.save();

  let dayId = event.block.timestamp.toI32() / 86400;
  let snapId = Bytes.fromI32(dayId);
  let snap = GlobalDailySnapshot.load(snapId);
  if (snap == null) {
    snap = new GlobalDailySnapshot(snapId);
    snap.dayId = dayId;
    snap.date = BigInt.fromI32(dayId * 86400);
    snap.totalTradesCount = ZERO_BI;
    snap.totalVolumeUSD = ZERO_BD;
    snap.totalFeesUSD = ZERO_BD;
    snap.totalSplits = ZERO_BI;
    snap.totalMerges = ZERO_BI;
    snap.totalRedemptions = ZERO_BI;
  }
  snap.totalMerges = snap.totalMerges.plus(ONE_BI);
  snap.save();
}

export function handlePayoutRedemption(event: PayoutRedemption): void {
  let id = event.transaction.hash.concatI32(event.logIndex.toI32());
  let user = getOrCreateUser(event.params.redeemer);
  let payoutUSD = toUSD(event.params.payout);

  let redemption = new Redemption(id);
  redemption.redeemer = user.id;
  redemption.conditionId = event.params.conditionId;
  redemption.collateralToken = event.params.collateralToken;
  redemption.payout = event.params.payout;
  redemption.payoutUSD = payoutUSD;
  redemption.timestamp = event.block.timestamp;
  redemption.txHash = event.transaction.hash;
  redemption.save();

  let stats = getOrCreateGlobalStats();
  stats.totalRedemptions = stats.totalRedemptions.plus(ONE_BI);
  stats.save();

  let dayId = event.block.timestamp.toI32() / 86400;
  let snapId = Bytes.fromI32(dayId);
  let snap = GlobalDailySnapshot.load(snapId);
  if (snap == null) {
    snap = new GlobalDailySnapshot(snapId);
    snap.dayId = dayId;
    snap.date = BigInt.fromI32(dayId * 86400);
    snap.totalTradesCount = ZERO_BI;
    snap.totalVolumeUSD = ZERO_BD;
    snap.totalFeesUSD = ZERO_BD;
    snap.totalSplits = ZERO_BI;
    snap.totalMerges = ZERO_BI;
    snap.totalRedemptions = ZERO_BI;
  }
  snap.totalRedemptions = snap.totalRedemptions.plus(ONE_BI);
  snap.save();
}

export function handleTransferSingle(event: TransferSingle): void {
  let from = event.params.from;
  let to = event.params.to;
  let tokenId = event.params.id;
  let value = event.params.value;

  if (from != ZERO_ADDRESS) {
    updatePosition(from, tokenId, ZERO_BI.minus(value), event.block.timestamp);
  }
  if (to != ZERO_ADDRESS) {
    updatePosition(to, tokenId, value, event.block.timestamp);
  }
}

export function handleTransferBatch(event: TransferBatch): void {
  let from = event.params.from;
  let to = event.params.to;
  let ids = event.params.ids;
  let values = event.params.values;

  for (let i = 0; i < ids.length; i++) {
    if (from != ZERO_ADDRESS) {
      updatePosition(from, ids[i], ZERO_BI.minus(values[i]), event.block.timestamp);
    }
    if (to != ZERO_ADDRESS) {
      updatePosition(to, ids[i], values[i], event.block.timestamp);
    }
  }
}

function updatePosition(
  userAddress: Address,
  tokenId: BigInt,
  delta: BigInt,
  timestamp: BigInt
): void {
  let user = getOrCreateUser(userAddress);
  let posId = userAddress.concat(changetype<Bytes>(Bytes.fromBigInt(tokenId)));

  let position = UserPosition.load(posId);
  if (position == null) {
    position = new UserPosition(posId);
    position.user = user.id;
    position.tokenId = tokenId;
    position.balance = ZERO_BI;
    position.netCostUSD = ZERO_BD;
    position.realizedPnlUSD = ZERO_BD;
  }

  // Link position to its condition via TokenToMarket lookup
  if (position.condition === null) {
    let tokenKey = changetype<Bytes>(Bytes.fromBigInt(tokenId));
    let lookup = TokenToMarket.load(tokenKey);
    if (lookup != null) {
      position.condition = lookup.market; // Market.id == conditionId == Condition.id
    }
  }

  position.balance = position.balance.plus(delta);
  position.lastUpdated = timestamp;
  position.save();
}
