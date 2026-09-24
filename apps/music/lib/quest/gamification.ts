/**
 * Progression, streaks and badges.
 *
 * Pure and deterministic: the calendar day is passed in rather than read from
 * the clock, so a streak rolling over at midnight is a test, not a thing you
 * have to stay up to observe.
 *
 * The design constraint that shapes everything here is that a round is *slow*.
 * Playing four notes on a violin takes five to ten seconds, against roughly
 * one second for a multiple-choice tap. So the reward loop cannot be built on
 * volume the way a flashcard app's is — a hundred rounds is a long session,
 * not a warm-up. Each round therefore has to carry more weight, and the
 * rewards are tuned accordingly: large per-round XP, short level ladders, and
 * badges that fire on the first occurrence of something rather than on the
 * hundredth.
 */

export type BadgeId =
    | "first_blood"
    | "flawless"
    | "dead_centre"
    | "combo_5"
    | "combo_10"
    | "week_streak"
    | "no_hints"
    | "key_cleared"
    | "ladder_complete"
    | "both_voices"
    | "sharp_ears"
    | "interval_master"
    | "chord_master";

export interface PlayerProgress {
    xp: number;
    /** Consecutive calendar days with at least one round. */
    dayStreak: number;
    bestDayStreak: number;
    /** Consecutive scoring rounds without dropping to zero stars. */
    combo: number;
    bestCombo: number;
    rounds: number;
    totalStars: number;
    /** ISO `YYYY-MM-DD` of the most recent round, or null if never played. */
    lastPlayedDay: string | null;
    /** Key ladder ids that have been cleared. */
    keysCleared: string[];
    badges: BadgeId[];
    /** Answer styles used at least once; drives the `both_voices` badge. */
    stylesUsed: string[];
}

export function createProgress(): PlayerProgress {
    return {
        xp: 0,
        dayStreak: 0,
        bestDayStreak: 0,
        combo: 0,
        bestCombo: 0,
        rounds: 0,
        totalStars: 0,
        lastPlayedDay: null,
        keysCleared: [],
        badges: [],
        stylesUsed: [],
    };
}

// ---------------------------------------------------------------------------
// experience
// ---------------------------------------------------------------------------

const XP_PER_STAR = 30;
/** Showing up and finishing a round is worth something even at zero stars. */
const XP_ATTEMPT = 5;

/**
 * Tighter tolerances pay more, because choosing to be judged strictly is the
 * player opting into a harder game and should never be the losing move.
 * Keyed by the tolerance in cents.
 */
const TOLERANCE_MULTIPLIER: Record<number, number> = {
    35: 0.8,
    25: 1.0,
    15: 1.35,
    8: 1.8,
};

/** How many consecutive clean rounds before the combo bonus stops growing. */
const COMBO_CAP = 10;
const COMBO_STEP = 0.05;

export interface RoundOutcome {
    stars: number;
    toleranceCents: number;
    /** Hint tokens spent. Hints are allowed, but they cost experience. */
    tokensSpent: number;
    /** `YYYY-MM-DD` in the player's local time. */
    day: string;
    keyId: string;
    answerStyle: string;
    /** Median absolute cents error, when the round produced one. */
    medianAbsCents: number | null;
    /**
     * Scales the experience. A tap drill answer takes a second, a sung phrase
     * ten, so drills pass a fraction here rather than paying out like a
     * full round and turning into an XP farm.
     */
    weight?: number;
}

/**
 * Experience for one round, before the combo bonus.
 *
 * Hints subtract rather than multiply: a fixed cost per token means a hint is
 * worth taking on a hard round and wasteful on an easy one, which is the
 * decision we want the player weighing.
 */
export function xpForRound(outcome: RoundOutcome): number {
    const multiplier = TOLERANCE_MULTIPLIER[outcome.toleranceCents] ?? 1.0;
    const base = XP_ATTEMPT + outcome.stars * XP_PER_STAR;
    const afterHints = base - outcome.tokensSpent * 8;
    return Math.max(XP_ATTEMPT, Math.round(afterHints * multiplier));
}

/**
 * Levels get longer as they go, but not exponentially.
 *
 * A quadratic ladder keeps early levels within a single sitting while still
 * making level 20 mean something. Exponential curves, at this round duration,
 * would put the later levels beyond what anyone will actually play.
 */
export function xpForLevel(level: number): number {
    if (level <= 1) return 0;
    const n = level - 1;
    return 60 * n + 20 * n * (n - 1);
}

export interface LevelInfo {
    level: number;
    /** Experience earned inside the current level. */
    into: number;
    /** Experience the current level requires in total. */
    needed: number;
}

export function levelForXp(xp: number): LevelInfo {
    const safeXp = Math.max(0, Math.floor(xp));
    let level = 1;
    while (xpForLevel(level + 1) <= safeXp) level += 1;
    const floor = xpForLevel(level);
    const ceiling = xpForLevel(level + 1);
    return { level, into: safeXp - floor, needed: ceiling - floor };
}

// ---------------------------------------------------------------------------
// day streaks
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` for a Date, in local time rather than UTC. */
export function dayStamp(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/** Whole days between two `YYYY-MM-DD` stamps. Negative if `b` precedes `a`. */
export function daysBetween(a: string, b: string): number {
    const parse = (stamp: string) => {
        const parts = stamp.split("-").map(Number);
        return Date.UTC(parts[0]!, (parts[1] ?? 1) - 1, parts[2] ?? 1);
    };
    return Math.round((parse(b) - parse(a)) / 86400000);
}

// ---------------------------------------------------------------------------
// applying a round
// ---------------------------------------------------------------------------

/** Stars needed, in one round, to count a key as cleared. */
const KEY_CLEAR_STARS = 3;

export interface RoundResult {
    next: PlayerProgress;
    xpGained: number;
    /** Badges earned by this round, in award order. Never previously held. */
    unlocked: BadgeId[];
    leveledUp: boolean;
}

/**
 * Folds one round into the player's progress.
 *
 * Returns a new object rather than mutating, so the caller can diff the two to
 * drive an animation and so a failed persist cannot leave a torn state.
 */
export function applyRound(previous: PlayerProgress, outcome: RoundOutcome): RoundResult {
    const beforeLevel = levelForXp(previous.xp).level;

    const combo = outcome.stars > 0 ? previous.combo + 1 : 0;
    const comboBonus = 1 + Math.min(combo, COMBO_CAP) * COMBO_STEP;
    const weight = outcome.weight ?? 1;
    const xpGained = Math.max(1, Math.round(xpForRound(outcome) * comboBonus * weight));

    const gap = previous.lastPlayedDay === null ? null : daysBetween(previous.lastPlayedDay, outcome.day);
    const dayStreak =
        gap === null ? 1
            : gap === 0 ? Math.max(1, previous.dayStreak)
                : gap === 1 ? previous.dayStreak + 1
                    // Any longer gap, or a clock that moved backwards, restarts it.
                    : 1;

    const keysCleared = [...previous.keysCleared];
    // An empty id means the round was not on the key ladder (e.g. 扒谱 mode).
    if (outcome.keyId && outcome.stars >= KEY_CLEAR_STARS && !keysCleared.includes(outcome.keyId)) {
        keysCleared.push(outcome.keyId);
    }

    const stylesUsed = [...previous.stylesUsed];
    if (!stylesUsed.includes(outcome.answerStyle)) stylesUsed.push(outcome.answerStyle);

    const next: PlayerProgress = {
        xp: previous.xp + xpGained,
        dayStreak,
        bestDayStreak: Math.max(previous.bestDayStreak, dayStreak),
        combo,
        bestCombo: Math.max(previous.bestCombo, combo),
        rounds: previous.rounds + 1,
        totalStars: previous.totalStars + outcome.stars,
        lastPlayedDay: outcome.day,
        keysCleared,
        badges: [...previous.badges],
        stylesUsed,
    };

    const unlocked: BadgeId[] = [];
    const award = (id: BadgeId, earned: boolean) => {
        if (earned && !next.badges.includes(id)) {
            next.badges.push(id);
            unlocked.push(id);
        }
    };

    award("first_blood", next.rounds >= 1);
    award("flawless", outcome.stars >= 3);
    award("dead_centre", outcome.medianAbsCents !== null && outcome.medianAbsCents <= 10);
    award("combo_5", combo >= 5);
    award("combo_10", combo >= 10);
    award("week_streak", dayStreak >= 7);
    award("no_hints", outcome.stars >= 3 && outcome.tokensSpent === 0);
    award("key_cleared", keysCleared.length >= 1);
    award("both_voices", stylesUsed.includes("voice") && stylesUsed.includes("violin"));

    return {
        next,
        xpGained,
        unlocked,
        leveledUp: levelForXp(next.xp).level > beforeLevel,
    };
}

/**
 * Marks the whole ladder complete once every key has been cleared.
 *
 * Separate from `applyRound` because it depends on the ladder's length, which
 * is a property of the curriculum rather than of the round.
 */
export function checkLadderComplete(progress: PlayerProgress, ladderSize: number): PlayerProgress {
    if (progress.keysCleared.length < ladderSize) return progress;
    if (progress.badges.includes("ladder_complete")) return progress;
    return { ...progress, badges: [...progress.badges, "ladder_complete"] };
}

/** Grants a badge earned outside `applyRound` (e.g. maxing a drill). No-op if already held. */
export function awardBadge(progress: PlayerProgress, id: BadgeId): { next: PlayerProgress; unlocked: boolean } {
    if (progress.badges.includes(id)) return { next: progress, unlocked: false };
    return { next: { ...progress, badges: [...progress.badges, id] }, unlocked: true };
}
