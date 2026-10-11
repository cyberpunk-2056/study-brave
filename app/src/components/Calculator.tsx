"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

const OPS = { "+": (a: number, b: number) => a + b, "-": (a: number, b: number) => a - b, "×": (a: number, b: number) => a * b, "÷": (a: number, b: number) => a / b };
type Op = keyof typeof OPS;

/** A built-in calculator — the kind every real desktop OS ships with. Pure client-side, no server involved. */
export function Calculator() {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [justEvaluated, setJustEvaluated] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false);
      if (/^[0-9]$/.test(e.key)) return digit(e.key);
      if (e.key === ".") return decimal();
      if (e.key === "Enter" || e.key === "=") return evaluate();
      if (e.key === "Backspace") return backspace();
      if (["+", "-"].includes(e.key)) return chooseOp(e.key as Op);
      if (e.key === "*") return chooseOp("×");
      if (e.key === "/") return chooseOp("÷");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, display, stored, op, justEvaluated]);

  const clearAll = () => {
    setDisplay("0");
    setStored(null);
    setOp(null);
    setJustEvaluated(false);
  };
  const digit = (d: string) => {
    if (justEvaluated) {
      setDisplay(d);
      setJustEvaluated(false);
      return;
    }
    setDisplay((s) => (s === "0" ? d : s.length < 16 ? s + d : s));
  };
  const decimal = () => {
    if (justEvaluated) {
      setDisplay("0.");
      setJustEvaluated(false);
      return;
    }
    setDisplay((s) => (s.includes(".") ? s : s + "."));
  };
  const backspace = () => setDisplay((s) => (s.length > 1 ? s.slice(0, -1) : "0"));
  const toggleSign = () => setDisplay((s) => (s.startsWith("-") ? s.slice(1) : s === "0" ? s : "-" + s));
  const percent = () => setDisplay((s) => String(Number(s) / 100));

  const chooseOp = (next: Op) => {
    const current = Number(display);
    if (stored != null && op && !justEvaluated) {
      const result = OPS[op](stored, current);
      setStored(result);
      setDisplay(formatResult(result));
    } else {
      setStored(current);
    }
    setOp(next);
    setJustEvaluated(true); // the next digit typed should replace the display, not append to the operand just stored
  };
  const evaluate = () => {
    if (stored == null || !op) return;
    const result = OPS[op](stored, Number(display));
    setDisplay(formatResult(result));
    setStored(null);
    setOp(null);
    setJustEvaluated(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-20 flex-col items-center gap-1.5 rounded-xl p-2 text-center transition hover:bg-white/10 focus-visible:bg-white/10 sm:w-24"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-soft text-fg shadow-sm transition group-hover:scale-105 sm:h-14 sm:w-14">
          <Icon name="calculator" className="h-6 w-6" />
        </span>
        <span className="line-clamp-2 text-xs font-medium text-fg drop-shadow sm:text-sm">Calculator</span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="Calculator">
            <button className="backdrop-enter absolute inset-0 bg-bg/60 backdrop-blur-sm" aria-label="Close" onClick={() => setOpen(false)} />
            <div className="drawer-enter absolute left-1/2 top-1/2 w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-line bg-surface p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Calculator</h2>
                <button className="btn-ghost !px-2.5" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" className="h-4 w-4" /></button>
              </div>
              <div className="mb-3 overflow-hidden rounded-2xl bg-soft px-4 py-5 text-right">
                {op && stored != null && <p className="truncate text-xs text-muted">{formatResult(stored)} {op}</p>}
                <p className="truncate text-3xl font-bold tabular-nums">{display}</p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <CalcBtn label="C" onClick={clearAll} tone="muted" />
                <CalcBtn label="±" onClick={toggleSign} tone="muted" />
                <CalcBtn label="%" onClick={percent} tone="muted" />
                <CalcBtn label="÷" onClick={() => chooseOp("÷")} tone="accent" active={op === "÷"} />
                <CalcBtn label="7" onClick={() => digit("7")} />
                <CalcBtn label="8" onClick={() => digit("8")} />
                <CalcBtn label="9" onClick={() => digit("9")} />
                <CalcBtn label="×" onClick={() => chooseOp("×")} tone="accent" active={op === "×"} />
                <CalcBtn label="4" onClick={() => digit("4")} />
                <CalcBtn label="5" onClick={() => digit("5")} />
                <CalcBtn label="6" onClick={() => digit("6")} />
                <CalcBtn label="−" onClick={() => chooseOp("-")} tone="accent" active={op === "-"} />
                <CalcBtn label="1" onClick={() => digit("1")} />
                <CalcBtn label="2" onClick={() => digit("2")} />
                <CalcBtn label="3" onClick={() => digit("3")} />
                <CalcBtn label="+" onClick={() => chooseOp("+")} tone="accent" active={op === "+"} />
                <CalcBtn label="0" onClick={() => digit("0")} wide />
                <CalcBtn label="." onClick={decimal} />
                <CalcBtn label="⌫" onClick={backspace} />
                <CalcBtn label="=" onClick={evaluate} tone="accent" filled />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function formatResult(n: number) {
  if (!Number.isFinite(n)) return "Error";
  return String(Math.round(n * 1e10) / 1e10);
}

function CalcBtn({
  label, onClick, tone = "default", active = false, filled = false, wide = false,
}: {
  label: string; onClick: () => void; tone?: "default" | "muted" | "accent"; active?: boolean; filled?: boolean; wide?: boolean;
}) {
  const base = "h-12 rounded-xl text-lg font-semibold transition active:scale-95";
  const look =
    filled ? "bg-accent text-white hover:brightness-110" :
    tone === "accent" ? `text-accent hover:bg-accent-soft ${active ? "bg-accent-soft" : "bg-soft"}` :
    tone === "muted" ? "bg-soft text-muted hover:text-fg" :
    "bg-soft text-fg hover:bg-line/60";
  return (
    <button type="button" onClick={onClick} className={`${base} ${look} ${wide ? "col-span-2" : ""}`}>
      {label}
    </button>
  );
}
