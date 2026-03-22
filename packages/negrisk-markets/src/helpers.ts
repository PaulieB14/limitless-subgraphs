import { BigDecimal, BigInt, Bytes, Address } from "@graphprotocol/graph-ts";
import { GlobalStats, User } from "../generated/schema";

export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let ZERO_BD = BigDecimal.fromString("0");

export let GLOBAL_STATS_ID = Bytes.fromUTF8("negrisk");

// USDC has 6 decimals — use for exchange trade/fee amounts
export function toUSD(amount: BigInt): BigDecimal {
  return amount.toBigDecimal().div(BigDecimal.fromString("1000000"));
}

// CTF split/merge/redemption amounts are in 1e18 (outcome token denomination)
export function toUSDFromCTF(amount: BigInt): BigDecimal {
  return amount.toBigDecimal().div(BigDecimal.fromString("1000000000000000000"));
}

export function getVenueFromAddress(address: Address): string {
  let addr = address.toHexString().toLowerCase();
  if (addr == "0x5a38afc17f7e97ad8d6c547ddb837e40b4aedfc6") return "v1";
  if (addr == "0x46e607d3f4a8494b0ab9b304d1463e2f4848891d") return "v2";
  if (addr == "0xe3e00ba3a9888d1de4834269f62ac008b4bb5c47") return "v3";
  return "unknown";
}

export function getOrCreateUser(address: Address): User {
  let id = address;
  let user = User.load(id);
  if (user == null) {
    user = new User(id);
    user.tradesCount = ZERO_BI;
    user.totalVolumeUSD = ZERO_BD;
    user.totalFeesUSD = ZERO_BD;
    user.realizedPnlUSD = ZERO_BD;
    user.firstTradeAt = null;
    user.lastTradeAt = null;
    user.save();

    let stats = getOrCreateGlobalStats();
    stats.totalUsers += 1;
    stats.save();
  }
  return user;
}

export function getOrCreateGlobalStats(): GlobalStats {
  let stats = GlobalStats.load(GLOBAL_STATS_ID);
  if (stats == null) {
    stats = new GlobalStats(GLOBAL_STATS_ID);
    stats.totalMarkets = 0;
    stats.resolvedMarkets = 0;
    stats.totalTradesCount = ZERO_BI;
    stats.totalVolumeUSD = ZERO_BD;
    stats.totalFeesUSD = ZERO_BD;
    stats.totalUsers = 0;
    stats.totalSplits = ZERO_BI;
    stats.totalMerges = ZERO_BI;
    stats.totalRedemptions = ZERO_BI;
    stats.save();
  }
  return stats;
}
