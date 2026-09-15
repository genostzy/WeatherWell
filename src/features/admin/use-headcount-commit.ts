"use client";

import { useEffect, useRef, useState } from "react";

/** How long typing must pause before a headcount is written without Enter or leaving the field. */
const COMMIT_DELAY_MS = 600;

type Write = (value: number | undefined) => void | Promise<void>;

interface CommitState {
  /** The value last handed to `write` (or the value the control started with). */
  committed: number | undefined;
  /** A typed value not yet written, boxed so "cleared" (undefined) is distinct from "nothing pending". */
  pending: { value: number | undefined } | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  write: Write;
}

function flush(state: CommitState) {
  clearTimeout(state.timer);
  state.timer = undefined;
  const next = state.pending;
  state.pending = null;
  if (!next || next.value === state.committed) return;
  state.committed = next.value;
  void state.write(next.value);
}

/**
 * A typed evacuation-centre headcount that is written once per committed
 * value, not once per keystroke (M9). Every write records a centre.occupancy
 * row in the action history, so typing "120" must not also record 1 and 12.
 *
 * The shown value follows every keystroke at once (the status beside it is
 * derived from it). The write happens on the first of: Enter, leaving the
 * field, a short pause in typing, or the control unmounting (a map popup
 * closing mid-edit must not lose the number). A value equal to the last one
 * written is not written again, so Enter followed by blur is still one write.
 */
export function useHeadcountCommit(initial: number | undefined, write: Write) {
  const [occupancy, setOccupancy] = useState<number | undefined>(initial);
  const state = useRef<CommitState>({ committed: initial, pending: null, timer: undefined, write });

  useEffect(() => {
    state.current.write = write;
  });

  useEffect(() => {
    const current = state.current;
    return () => flush(current);
  }, []);

  return {
    occupancy,
    /** Every keystroke: show it now, write it once typing settles. */
    change(value: number | undefined) {
      setOccupancy(value);
      const current = state.current;
      current.pending = { value };
      clearTimeout(current.timer);
      current.timer = setTimeout(() => flush(current), COMMIT_DELAY_MS);
    },
    /** Enter or leaving the field: write what was typed, now. */
    commit() {
      flush(state.current);
    },
    /** An explicit action such as Clear: show and write this value, now. */
    set(value: number | undefined) {
      setOccupancy(value);
      state.current.pending = { value };
      flush(state.current);
    },
  };
}
