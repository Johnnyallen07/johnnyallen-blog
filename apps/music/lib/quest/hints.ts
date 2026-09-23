import type { HintType, HintSpec, HintLedger, TokenWallet } from "./types.ts";

export const FREE_REPLAYS = 3;
export const FREE_TIER_DAILY_TOKENS = 5;
export const PRO_TIER_DAILY_TOKENS = 50;
export const MAX_TOTAL_PENALTY = 0.75;

export const HINT_CATALOG: Record<HintType, HintSpec> = {
    replay: { tokens: 1, penalty: 0.02, label: "再听一次 / Replay", forfeitsScoring: false },
    slow_75: { tokens: 1, penalty: 0.05, label: "0.75x 慢放 / Slow to 75%", forfeitsScoring: false },
    slow_50: { tokens: 2, penalty: 0.10, label: "0.5x 慢放 / Slow to 50%", forfeitsScoring: false },
    isolate_note: { tokens: 1, penalty: 0.05, label: "单音循环 / Loop one note", forfeitsScoring: false },
    reveal_key: { tokens: 2, penalty: 0.10, label: "显示调号 / Show the key", forfeitsScoring: false },
    reveal_first_note: { tokens: 3, penalty: 0.15, label: "显示首音 / Show the first note", forfeitsScoring: false },
    reveal_rhythm: { tokens: 4, penalty: 0.20, label: "显示节奏骨架 / Show the rhythm", forfeitsScoring: false },
    reveal_score: { tokens: 0, penalty: 0.0, label: "直接看谱 / Show the notation", forfeitsScoring: true },
};

export function createHintLedger(): HintLedger {
    return {
        used: [],
        freeReplaysRemaining: FREE_REPLAYS,
    };
}

export function takeHint(ledger: HintLedger, hint: HintType): number {
    if (hint === "replay" && ledger.freeReplaysRemaining > 0) {
        ledger.freeReplaysRemaining--;
        return 0;
    }
    ledger.used.push(hint);
    return HINT_CATALOG[hint].tokens;
}

export function ledgerTokensSpent(ledger: HintLedger): number {
    return ledger.used.reduce((total, h) => total + HINT_CATALOG[h].tokens, 0);
}

export function ledgerForfeited(ledger: HintLedger): boolean {
    return ledger.used.some(h => HINT_CATALOG[h].forfeitsScoring);
}

export function ledgerPenalty(ledger: HintLedger): number {
    if (ledgerForfeited(ledger)) {
        return 1.0;
    }
    const total = ledger.used.reduce((sum, h) => sum + HINT_CATALOG[h].penalty, 0.0);
    return Math.min(total, MAX_TOTAL_PENALTY);
}

export function ledgerMultiplier(ledger: HintLedger): number {
    return ledgerForfeited(ledger) ? 0.0 : 1.0 - ledgerPenalty(ledger);
}

export function ledgerBreakdown(ledger: HintLedger): Record<string, number> {
    const out: Record<string, number> = {};
    for (const h of ledger.used) {
        out[h] = (out[h] || 0) + 1;
    }
    return out;
}

export function createTokenWallet(balance = FREE_TIER_DAILY_TOKENS, isPro = false): TokenWallet {
    return { balance, isPro };
}

export function walletDailyGrant(wallet: TokenWallet): number {
    return wallet.isPro ? PRO_TIER_DAILY_TOKENS : FREE_TIER_DAILY_TOKENS;
}

export function walletRefillDaily(wallet: TokenWallet): void {
    wallet.balance = Math.max(wallet.balance, walletDailyGrant(wallet));
}

export function walletCanAfford(wallet: TokenWallet, hint: HintType): boolean {
    return wallet.balance >= HINT_CATALOG[hint].tokens;
}

export function walletSpend(wallet: TokenWallet, hint: HintType): boolean {
    const cost = HINT_CATALOG[hint].tokens;
    if (wallet.balance < cost) {
        return false;
    }
    wallet.balance -= cost;
    return true;
}

export function walletAward(wallet: TokenWallet, tokens: number): void {
    wallet.balance += Math.max(0, tokens);
}
