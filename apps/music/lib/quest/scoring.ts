import { bestAlignment, residualOffsetCents } from "./align.ts";
import { HINT_CATALOG, ledgerMultiplier, createHintLedger } from "./hints.ts";
import { noteName, bestFingering, adjustedTargetMidi, formatFingering, isOpenString, stringNameOf } from "./theory.ts";
import type {
    Alignment, Feedback, Lick, NoteEvent, NoteScore, Score, ScoreOptions
} from "./types.ts";

export const W_SEQUENCE = 0.50;
export const W_INTONATION = 0.35;
export const W_RHYTHM = 0.15;

const INTONATION_FALLOFF = 2.5;

export const SEVERE_INTONATION_SEMITONES = 1.5;

const OPEN_STRING_ALARM_CENTS = 20.0;
const OPEN_STRING_SINGLE_NOTE_ALARM_CENTS = 40.0;

const RHYTHM_FALLOFF_OCTAVES = Math.log2(1.5);

const STAR2_IN_TUNE_FRACTION = 0.80;
const STAR3_RHYTHM = 0.80;
const STAR3_MAX_TOKENS = 1;
const STAR1_MAX_MISSES = 1;

function median(nums: number[]): number | null {
    if (nums.length === 0) return null;
    const sorted = nums.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1]! + sorted[mid]!) / 2.0;
    }
    return sorted[mid]!;
}

export function scoreSequence(alignment: Alignment): number {
    if (alignment.nTarget === 0) return 0.0;
    
    let nMatch = 0;
    let nIns = 0;
    for (const p of alignment.pairs) {
        if (p.op === "match") nMatch++;
        if (p.op === "ins") nIns++;
    }

    const credit = nMatch - 0.5 * nIns;
    return Math.max(0.0, Math.min(1.0, credit / alignment.nTarget));
}

function intonationCredit(centsError: number, tolerance: number): number {
    const a = Math.abs(centsError);
    if (a <= tolerance) return 1.0;
    const span = tolerance * (INTONATION_FALLOFF - 1.0);
    return Math.max(0.0, Math.min(1.0, 1.0 - (a - tolerance) / span));
}

export function scoreIntonation(noteScores: readonly NoteScore[], tolerance: number): number {
    const cap = SEVERE_INTONATION_SEMITONES * 100.0;
    const credits: number[] = [];
    for (const ns of noteScores) {
        if (ns.centsError !== null && (ns.op === "match" || Math.abs(ns.centsError) <= cap)) {
            credits.push(intonationCredit(ns.centsError, tolerance));
        }
    }
    if (credits.length === 0) return 0.0;
    let sum = 0;
    for (const c of credits) sum += c;
    return sum / credits.length;
}

export function scoreRhythm(lick: Lick, events: readonly NoteEvent[], alignment: Alignment): number | null {
    let currentBeat = 0.0;
    const targetOnsets: number[] = [];
    for (const n of lick.notes) {
        targetOnsets.push(currentBeat);
        currentBeat += n.beats;
    }
    
    const pairs = alignment.pairs
        .filter(p => p.op === "match" && p.targetIndex !== null && p.detectedIndex !== null)
        .sort((a, b) => a.targetIndex! - b.targetIndex!);

    if (pairs.length < 3) return null;

    const tTimes = pairs.map(p => targetOnsets[p.targetIndex!]!);
    const dTimes = pairs.map(p => events[p.detectedIndex!]!.onsetS);
    
    let sumT = 0, sumD = 0;
    const tIoI: number[] = [];
    const dIoI: number[] = [];
    for (let i = 0; i < tTimes.length - 1; i++) {
        const tDiff = tTimes[i + 1]! - tTimes[i]!;
        const dDiff = dTimes[i + 1]! - dTimes[i]!;
        if (tDiff > 1e-6 && dDiff > 1e-6) {
            tIoI.push(tDiff);
            dIoI.push(dDiff);
            sumT += tDiff;
            sumD += dDiff;
        }
    }

    if (tIoI.length < 2) return null;

    const meanT = sumT / tIoI.length;
    const meanD = sumD / dIoI.length;

    let sumCredit = 0.0;
    for (let i = 0; i < tIoI.length; i++) {
        const tRel = tIoI[i]! / meanT;
        const dRel = dIoI[i]! / meanD;
        const err = Math.abs(Math.log2(dRel / tRel));
        const credit = Math.max(0.0, Math.min(1.0, 1.0 - err / RHYTHM_FALLOFF_OCTAVES));
        sumCredit += credit;
    }

    return sumCredit / tIoI.length;
}

function awardStars(alignment: Alignment, noteScores: readonly NoteScore[], rhythmScore: number | null, tokensSpent: number): number {
    let nSub = 0, nDel = 0, nMatch = 0;
    for (const p of alignment.pairs) {
        if (p.op === "sub") nSub++;
        if (p.op === "del") nDel++;
        if (p.op === "match") nMatch++;
    }

    const misses = nSub + nDel;
    if (misses > STAR1_MAX_MISSES || nMatch === 0) return 0;

    let stars = 1;
    let playedValid = 0;
    let playedInTune = 0;
    for (const ns of noteScores) {
        if (ns.op === "match" && ns.centsError !== null) {
            playedValid++;
            if (ns.inTune) playedInTune++;
        }
    }

    const inTuneFraction = playedValid > 0 ? playedInTune / playedValid : 0.0;
    if (inTuneFraction < STAR2_IN_TUNE_FRACTION) return stars;
    
    stars = 2;
    const rhythmOk = rhythmScore === null || rhythmScore >= STAR3_RHYTHM;
    if (rhythmOk && tokensSpent <= STAR3_MAX_TOKENS) {
        stars = 3;
    }
    return stars;
}

/** How many offending notes are worth naming before the list stops being advice. */
const MAX_NAMED_NOTES = 3;

function buildFeedback(alignment: Alignment, noteScores: readonly NoteScore[], rhythmScore: number | null, tolerance: number, medianCents: number | null): Feedback[] {
    const out: Feedback[] = [];
    let nMatch = 0, nDel = 0, nIns = 0;
    for (const p of alignment.pairs) {
        if (p.op === "match") nMatch++;
        if (p.op === "del") nDel++;
        if (p.op === "ins") nIns++;
    }

    if (nMatch === 0) {
        out.push({ code: "noNotes" });
        return out;
    }

    if (nDel > 0) {
        out.push({ code: "missedNotes", count: nDel });
    }

    // A substitution can mean two very different things, and conflating them is
    // actively misleading: "you played the wrong note" is a reading error,
    // "that note was badly out of tune" is a hand-placement error. They are
    // separated by SEVERE_INTONATION_SEMITONES.
    const cap = SEVERE_INTONATION_SEMITONES * 100.0;
    const subs = noteScores.filter(ns => ns.op === "sub");
    const wrongNote = subs.filter(ns => ns.centsError === null || Math.abs(ns.centsError) > cap);
    const badlyTuned = subs.filter(ns => !wrongNote.includes(ns));

    if (wrongNote.length > 0) {
        out.push({
            code: "wrongNotes",
            notes: wrongNote.slice(0, MAX_NAMED_NOTES).map(ns => ({
                index: ns.targetIndex + 1,
                expected: noteName(ns.targetMidi),
            })),
            truncated: wrongNote.length > MAX_NAMED_NOTES,
        });
    }
    if (badlyTuned.length > 0) {
        out.push({
            code: "badlyTuned",
            notes: badlyTuned.slice(0, MAX_NAMED_NOTES).map(ns => ({
                expected: noteName(ns.targetMidi),
                cents: Math.round(ns.centsError!),
            })),
            truncated: badlyTuned.length > MAX_NAMED_NOTES,
        });
    }

    if (nIns > 0) {
        out.push({ code: "extraNotes", count: nIns });
    }

    const byString: Record<string, number[]> = {};
    for (const ns of noteScores) {
        if (ns.fingering && isOpenString(ns.fingering) && ns.centsError !== null) {
            const strName = stringNameOf(ns.fingering);
            if (!byString[strName]) byString[strName] = [];
            byString[strName]!.push(ns.centsError);
        }
    }

    // "Your violin is out of tune" is a strong claim, so it needs corroboration:
    // either two open-string notes erring the same way, or one note so far off
    // that no hand position explains it.
    const detuned: string[] = [];
    for (const strName of Object.keys(byString)) {
        const errors = byString[strName]!;
        const med = median(errors)!;
        if (errors.length >= 2) {
            const allPos = errors.every(e => e > 0);
            const allNeg = errors.every(e => e < 0);
            if ((allPos || allNeg) && Math.abs(med) > OPEN_STRING_ALARM_CENTS) {
                detuned.push(strName);
            }
        } else if (Math.abs(med) > OPEN_STRING_SINGLE_NOTE_ALARM_CENTS) {
            detuned.push(strName);
        }
    }

    if (detuned.length > 0) {
        detuned.sort();
        out.push({ code: "openStringDetuned", strings: detuned });
    } else if (medianCents !== null && Math.abs(medianCents) > tolerance * 0.6) {
        out.push({
            code: "systematicOffset",
            cents: Math.round(Math.abs(medianCents)),
            sharp: medianCents > 0,
        });
    }

    const worsts = noteScores.filter(ns => ns.centsError !== null && !ns.inTune);
    if (worsts.length > 0) {
        worsts.sort((a, b) => Math.abs(b.centsError!) - Math.abs(a.centsError!));
        const w = worsts[0]!;
        out.push({
            code: "worstNote",
            note: noteName(w.targetMidi),
            fingering: w.fingering ? formatFingering(w.fingering) : null,
            cents: Math.round(w.centsError!),
        });
    }

    if (rhythmScore !== null && rhythmScore < STAR3_RHYTHM) {
        out.push({ code: "rhythmUnsteady" });
    }

    if (out.length === 0) {
        out.push({ code: "clean" });
    }
    return out;
}

export function scoreAttempt(lick: Lick, events: readonly NoteEvent[], options: ScoreOptions = {}): Score {
    const mode = options.mode ?? "absolute";
    const tolerance = options.tolerance ?? 25; // BEGINNER
    const temperament = options.temperament ?? "equal";
    const ledger = options.ledger ?? createHintLedger();
    const gradeRhythm = options.gradeRhythm ?? true;

    const lickPitches = lick.notes.map(n => n.midi);
    const detectedPitches = events.map(e => e.midi);
    const alignment = bestAlignment(lickPitches, detectedPitches, mode);

    const offsetCents = mode === "relative" ? residualOffsetCents(alignment) : 0.0;

    const noteScores: NoteScore[] = [];
    for (const pair of alignment.pairs) {
        if (pair.targetIndex === null) continue;
        const targetMidi = lickPitches[pair.targetIndex]!;
        const fingering = bestFingering(targetMidi);
        
        if (pair.op === "del" || pair.detectedIndex === null) {
            noteScores.push({
                targetIndex: pair.targetIndex,
                targetMidi,
                playedMidi: null,
                centsError: null,
                inTune: false,
                op: pair.op,
                fingering,
            });
            continue;
        }

        const played = events[pair.detectedIndex]!.midi;
        const reference = adjustedTargetMidi(targetMidi, lick.tonicMidi % 12, temperament) + alignment.transposeSemitones + offsetCents / 100.0;
        const cents = (played - reference) * 100.0;

        noteScores.push({
            targetIndex: pair.targetIndex,
            targetMidi,
            playedMidi: played,
            centsError: cents,
            inTune: pair.op === "match" && Math.abs(cents) <= tolerance,
            op: pair.op,
            fingering,
        });
    }

    noteScores.sort((a, b) => a.targetIndex - b.targetIndex);

    const seq = scoreSequence(alignment);
    const intonation = scoreIntonation(noteScores, tolerance);
    const rhythm = gradeRhythm ? scoreRhythm(lick, events, alignment) : null;

    let totalWeight = W_SEQUENCE + W_INTONATION;
    let sumWeight = seq * W_SEQUENCE + intonation * W_INTONATION;
    
    if (rhythm !== null) {
        totalWeight += W_RHYTHM;
        sumWeight += rhythm * W_RHYTHM;
    }
    const rawTotal = totalWeight > 0 ? sumWeight / totalWeight : 0.0;

    const errors: number[] = [];
    for (const ns of noteScores) {
        if (ns.centsError !== null) errors.push(ns.centsError);
    }
    const medianCents = median(errors);

    const tokensSpent = ledger.used.reduce((total, h) => total + HINT_CATALOG[h].tokens, 0);
    const forfeited = ledger.used.some(h => HINT_CATALOG[h].forfeitsScoring);

    let stars = awardStars(alignment, noteScores, rhythm, tokensSpent);
    if (forfeited) stars = 0;

    const feedback = buildFeedback(alignment, noteScores, rhythm, tolerance, medianCents);

    return {
        sequence: seq,
        intonation,
        rhythm,
        total: rawTotal * ledgerMultiplier(ledger),
        rawTotal: rawTotal,
        stars,
        alignment,
        noteScores,
        toleranceCents: tolerance,
        tokensSpent: tokensSpent,
        medianCentsError: medianCents,
        feedback,
    };
}
