import { BigDecimal, BigInt, Bytes, Address } from "@graphprotocol/graph-ts";
import { GlobalStats, User } from "../generated/schema";

export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let ZERO_BD = BigDecimal.fromString("0");

// Singleton ID for GlobalStats
export let GLOBAL_STATS_ID = Bytes.fromUTF8("simple");

// USDC has 6 decimals
export function toUSD(amount: BigInt): BigDecimal {
  return amount.toBigDecimal().div(BigDecimal.fromString("1000000"));
}

export function getVenueFromAddress(address: Address): string {
  let addr = address.toHexString().toLowerCase();
  if (addr == "0xa4409d988ca2218d956beefd3874100f444f0dc3") return "v1";
  if (addr == "0xf1de958f8641448a5ba78c01f434085385af096d") return "v2";
  if (addr == "0x05c748e2f4dcde0ec9fa8ddc40de6b867f923fa5") return "v3";
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
