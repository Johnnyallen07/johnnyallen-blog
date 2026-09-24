/**
 * Five-line treble staff drawn entirely in SVG paths.
 *
 * Every glyph (clef, sharps, flats, naturals) is a path rather than a Unicode
 * character. The previous `𝄞` text glyph rendered from whatever font the OS
 * happened to have, which meant a different clef — or a tofu box — on every
 * machine, and never one aligned to the G line.
 *
 * Coordinate system: one staff space = 10 units, the G4 line is y = 0, and y
 * grows downward. The SVG scales with its container through `viewBox`.
 */

import { useMemo } from "react";

import type { StaffNoteGlyph } from "@/lib/quest/foundation";
import type { NoteScore } from "@/lib/quest/types";

const STEP = 5;
const INK = "#1e293b";
const LINE = "#94a3b8";

/** Movable-do colours (Boomwhacker order), so a degree is recognisable before it is read. */
const DEGREE_COLOURS = ["#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#2563eb", "#7c3aed"];

/** Staff steps (E4 = 0) of each accidental in a treble key signature, in writing order. */
const SHARP_STEPS = [8, 5, 9, 6, 3, 7, 4];
const FLAT_STEPS = [4, 7, 3, 6, 2, 5, 1];

const yOf = (step: number) => 10 - STEP * step;

function TrebleClef({ x, octaveDown }: { x: number; octaveDown: boolean }) {
    return (
        <g transform={`translate(${x} 0)`}>
            <g fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
                <path
                    strokeWidth={1.6}
                    d="M -5,22 C -6,27 3,28 3.5,21 C 4,10 1.5,-20 1.5,-34 C 1.5,-43 5,-50 7.5,-47.5 C 10.5,-44 4,-34 -3,-26 C -9,-19 -12,-10 -11,-1 C -10,8 -3,11.5 3,11 C 10,10 12,-2 6,-7 C 1,-11 -6,-8 -5,-2 C -4,2 0,3 1.5,1"
                />
                <path strokeWidth={3} d="M -3,-26 C -9,-19 -12,-10 -11,-1 C -10,8 -3,11.5 3,11 C 10,10 12,-2 6,-7" />
            </g>
            <circle cx={-3.5} cy={22} r={3.2} fill={INK} />
            {octaveDown && (
                <text x={0} y={37} textAnchor="middle" fontSize={8} fontWeight={700} fill={INK}>
                    8
                </text>
            )}
        </g>
    );
}

function Sharp({ x, y, colour = INK }: { x: number; y: number; colour?: string }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <path d="M -1.6,-8 L -1.6,9 M 1.6,-9 L 1.6,8" stroke={colour} strokeWidth={0.9} />
            <path d="M -3.6,-1.6 L 3.6,-4 L 3.6,-2 L -3.6,0.4 Z M -3.6,4.4 L 3.6,2 L 3.6,4 L -3.6,6.4 Z" fill={colour} />
        </g>
    );
}

function Flat({ x, y, colour = INK }: { x: number; y: number; colour?: string }) {
    return (
        <g transform={`translate(${x} ${y})`} fill="none" stroke={colour} strokeLinecap="round">
            <path d="M -2,-12 L -2,4.5" strokeWidth={1} />
            <path d="M -2,4.5 C 2.5,1.5 4.5,-2 2,-3.6 C 0.4,-4.6 -1.4,-3 -2,-1.8" strokeWidth={1.5} />
        </g>
    );
}

function Natural({ x, y, colour = INK }: { x: number; y: number; colour?: string }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <path d="M -2,-9 L -2,4 M 2,-4 L 2,9" stroke={colour} strokeWidth={0.9} />
            <path d="M -2,-2.4 L 2,-4 L 2,-2 L -2,-0.4 Z M -2,3 L 2,1.4 L 2,3.4 L -2,5 Z" fill={colour} />
        </g>
    );
}

function Accidental({ kind, x, y, colour }: { kind: "♯" | "♭" | "♮"; x: number; y: number; colour?: string }) {
    if (kind === "♯") return <Sharp x={x} y={y} colour={colour} />;
    if (kind === "♭") return <Flat x={x} y={y} colour={colour} />;
    return <Natural x={x} y={y} colour={colour} />;
}

interface Placed {
    glyph: StaffNoteGlyph;
    step: number;
    x: number;
    accidental: "♯" | "♭" | "♮" | null;
}

export function TrebleStaffSvg({
    glyphs,
    keySignature,
    flats,
    octaveDown = false,
    showSolfege,
    showSteppingStones,
    noteScores,
}: {
    glyphs: readonly StaffNoteGlyph[];
    /** Accidental names in writing order, e.g. `["F♯", "C♯"]`. */
    keySignature: readonly string[];
    flats: boolean;
    /**
     * Draw as a tenor ("treble 8vb") clef. Male voices sound an octave below
     * written pitch, so the notes are raised one octave onto the staff and a
     * small 8 under the clef says so — the way every choral score does it.
     */
    octaveDown?: boolean;
    showSolfege: boolean;
    showSteppingStones: boolean;
    noteScores?: readonly NoteScore[];
}) {
    const shift = octaveDown ? 7 : 0;

    const scoreByTarget = useMemo(() => {
        const map = new Map<number, NoteScore>();
        for (const ns of noteScores ?? []) map.set(ns.targetIndex, ns);
        return map;
    }, [noteScores]);

    // Letter -> accidental implied by the key signature.
    const keyAccidentalOf = useMemo(() => {
        const map = new Map<string, "♯" | "♭">();
        for (const name of keySignature) {
            const letter = name[0];
            const acc = name.includes("♭") ? "♭" : "♯";
            if (letter) map.set(letter, acc);
        }
        return map;
    }, [keySignature]);

    const clefX = 16;
    const keyStartX = 32;
    const keyWidth = keySignature.length * 8;
    const firstNoteX = keyStartX + keyWidth + 16;

    const { placed, endX } = useMemo(() => {
        const out: Placed[] = [];
        let x = firstNoteX;
        for (const glyph of glyphs) {
            if (glyph.isSteppingStone && !showSteppingStones) continue;
            const letter = glyph.name[0] ?? "";
            const implied = keyAccidentalOf.get(letter) ?? "";
            const written = glyph.accidental;
            const accidental =
                glyph.visibility === "hidden" || written === implied ? null : written === "" ? "♮" : written;
            if (accidental) x += 7;
            out.push({ glyph, step: glyph.staffStep + shift, x, accidental });
            x += glyph.isSteppingStone ? 17 : 26 + Math.max(0, glyph.beats - 1) * 6;
        }
        return { placed: out, endX: x };
    }, [firstNoteX, glyphs, keyAccidentalOf, shift, showSteppingStones]);

    const top = Math.min(-54, ...placed.map(p => yOf(p.step) - (p.step < 4 ? 38 : 10)));
    const staffBottom = Math.max(28, ...placed.map(p => yOf(p.step) + (p.step < 4 ? 8 : 36)));
    const solfegeY = staffBottom + 4;
    const centsY = solfegeY + (showSolfege ? 12 : 2);
    const bottom = centsY + (noteScores ? 6 : 0);
    const width = Math.max(endX + 6, 200);
    const height = bottom - top;

    return (
        <svg
            viewBox={`0 ${top} ${width} ${height}`}
            className="mx-auto block h-auto w-full"
            style={{ maxWidth: `${width * 2.6}px` }}
            role="img"
        >
            {[0, 2, 4, 6, 8].map(step => (
                <line key={step} x1={2} x2={width - 2} y1={yOf(step)} y2={yOf(step)} stroke={LINE} strokeWidth={0.7} />
            ))}
            <line x1={width - 5} x2={width - 5} y1={yOf(8)} y2={yOf(0)} stroke={LINE} strokeWidth={0.8} />
            <line x1={width - 2} x2={width - 2} y1={yOf(8)} y2={yOf(0)} stroke={INK} strokeWidth={2} />

            <TrebleClef x={clefX} octaveDown={octaveDown} />

            {keySignature.map((_, i) => {
                const step = (flats ? FLAT_STEPS : SHARP_STEPS)[i] ?? 4;
                const x = keyStartX + i * 8 + 4;
                return flats ? <Flat key={i} x={x} y={yOf(step)} /> : <Sharp key={i} x={x} y={yOf(step)} />;
            })}

            {placed.map(({ glyph, step, x, accidental }, index) => {
                const y = yOf(step);
                const ns = glyph.targetIndex >= 0 ? scoreByTarget.get(glyph.targetIndex) : undefined;

                if (glyph.visibility === "hidden") {
                    return (
                        <g key={index}>
                            <rect x={x - 9} y={-34} width={18} height={50} rx={5} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 2" />
                            <text x={x} y={-3} textAnchor="middle" fontSize={14} fontWeight={700} fill="#d97706">
                                ?
                            </text>
                        </g>
                    );
                }

                const ghost = glyph.visibility === "ghost";
                const anchor = glyph.targetIndex === -1 && !ghost;
                const colour = ghost
                    ? "#818cf8"
                    : ns
                        ? ns.inTune
                            ? "#059669"
                            : ns.op === "match"
                                ? "#d97706"
                                : "#e11d48"
                        : anchor
                            ? "#0d9488"
                            : INK;
                const scale = ghost ? 0.72 : 1;
                const hollow = glyph.beats >= 2 && !ghost;
                const dotted = !ghost && Math.abs(glyph.beats - 1.5) < 0.01;
                const flagged = !ghost && glyph.beats <= 0.5;
                const stemUp = step < 4;
                const stemX = stemUp ? x + 5.6 : x - 5.6;
                const stemEnd = stemUp ? y - 33 : y + 33;

                const ledgers: number[] = [];
                for (let s = -2; s >= step; s -= 2) ledgers.push(s);
                for (let s = 10; s <= step; s += 2) ledgers.push(s);

                const degreeColour = DEGREE_COLOURS[(glyph.degree - 1) % 7] ?? INK;

                return (
                    <g key={index} opacity={ghost ? 0.75 : 1}>
                        {ledgers.map(ls => (
                            <line key={ls} x1={x - 9} x2={x + 9} y1={yOf(ls)} y2={yOf(ls)} stroke={INK} strokeWidth={0.8} />
                        ))}
                        {accidental && <Accidental kind={accidental} x={x - 11} y={y} colour={colour} />}
                        {!ghost && <line x1={stemX} x2={stemX} y1={y} y2={stemEnd} stroke={colour} strokeWidth={1} />}
                        {flagged && (
                            <path
                                d={
                                    stemUp
                                        ? `M ${stemX},${stemEnd} C ${stemX + 1},${stemEnd + 7} ${stemX + 8},${stemEnd + 9} ${stemX + 6},${stemEnd + 18}`
                                        : `M ${stemX},${stemEnd} C ${stemX + 1},${stemEnd - 7} ${stemX + 8},${stemEnd - 9} ${stemX + 6},${stemEnd - 18}`
                                }
                                fill="none"
                                stroke={colour}
                                strokeWidth={1.4}
                            />
                        )}
                        <ellipse
                            cx={x}
                            cy={y}
                            rx={6.2 * scale}
                            ry={4.3 * scale}
                            transform={`rotate(-20 ${x} ${y})`}
                            fill={hollow ? "#ffffff" : ghost ? "#eef2ff" : colour}
                            stroke={colour}
                            strokeWidth={hollow ? 1.6 : ghost ? 0.9 : 0.6}
                            strokeDasharray={ghost ? "2 1.4" : undefined}
                        />
                        {dotted && <circle cx={x + 10} cy={step % 2 === 0 ? y - 2.5 : y} r={1.4} fill={colour} />}
                        {showSolfege && (
                            <text
                                x={x}
                                y={solfegeY + 6}
                                textAnchor="middle"
                                fontSize={ghost ? 5.5 : 7}
                                fontWeight={700}
                                fill={ghost ? "#a5b4fc" : degreeColour}
                            >
                                {glyph.solfege}
                            </text>
                        )}
                        {ns && ns.centsError !== null && (
                            <text x={x} y={centsY + 5} textAnchor="middle" fontSize={5.5} fontWeight={600} fill={ns.inTune ? "#059669" : "#e11d48"}>
                                {ns.centsError > 0 ? "+" : ""}
                                {Math.round(ns.centsError)}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
