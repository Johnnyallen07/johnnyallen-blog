import test from 'node:test';
import assert from 'node:assert';
import { 
    createHintLedger, takeHint, ledgerPenalty, ledgerMultiplier,
    createTokenWallet, walletSpend, walletRefillDaily 
} from './hints.ts';

test("replays are free up to the allowance", () => {
    const ledger = createHintLedger();
    for (let i = 0; i < 3; i++) {
        assert.equal(takeHint(ledger, "replay"), 0);
    }
    assert.equal(takeHint(ledger, "replay"), 1);
});

test("hint penalty is capped", () => {
    const ledger = createHintLedger();
    const hints = ["reveal_rhythm", "reveal_first_note", "slow_50", "reveal_key", "isolate_note", "isolate_note"];
    for (const h of hints) {
        takeHint(ledger, h);
    }
    assert.ok(ledgerPenalty(ledger) <= 0.75);
    assert.ok(ledgerMultiplier(ledger) >= 0.25);
});

test("wallet refuses to overspend", () => {
    const wallet = createTokenWallet(2);
    assert.equal(walletSpend(wallet, "slow_50"), true); // costs 2
    assert.equal(wallet.balance, 0);
    assert.equal(walletSpend(wallet, "replay"), false); // costs 1
});

test("pro wallet refills higher", () => {
    const free = createTokenWallet(0);
    const pro = createTokenWallet(0, true);
    walletRefillDaily(free);
    walletRefillDaily(pro);
    assert.ok(pro.balance > free.balance);
});
