// Co-editing one text box from several phones (Mew, 27 Oct 2026: every member edits the group's post).
// Each phone sends its edits a moment after typing stops. When someone else changed the text in the meantime,
// the two edits are combined, so neither phone's typing is lost.

/** The one stretch where `a` and `b` differ: a[start, aEnd) became b[start, bEnd). */
export function splice(a: string, b: string): {start: number; aEnd: number; bEnd: number} {
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a[start] === b[start]) start++;
  let ea = a.length;
  let eb = b.length;
  while (ea > start && eb > start && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  return {start, aEnd: ea, bEnd: eb};
}

/**
 * Three-way merge: `base` = what both phones last agreed on, `mine` = this phone's text, `theirs` = what the
 * database has now. Edits in different places are both kept; where they overlap, theirs is kept and what this
 * phone typed is inserted next to it (nothing typed is lost).
 */
export function merge3(base: string, mine: string, theirs: string): string {
  if (mine === base) return theirs;
  if (theirs === base || theirs === mine) return mine;
  const m = splice(base, mine);
  const t = splice(base, theirs);
  const ins = mine.slice(m.start, m.bEnd);
  if (m.aEnd <= t.start) return base.slice(0, m.start) + ins + base.slice(m.aEnd, t.start) + theirs.slice(t.start, t.bEnd) + base.slice(t.aEnd);
  if (t.aEnd <= m.start) return base.slice(0, t.start) + theirs.slice(t.start, t.bEnd) + base.slice(t.aEnd, m.start) + ins + base.slice(m.aEnd);
  // Overlap: keep their version and put this phone's new words right after their change.
  const at = t.bEnd;
  return theirs.slice(0, at) + (ins && !/\s$/.test(theirs.slice(0, at)) && !/^\s/.test(ins) ? ' ' : '') + ins + theirs.slice(at);
}

/** Where a caret at `pos` in `before` ends up in `after` (so a co-editor's change doesn't move it). */
export function shiftCaret(before: string, after: string, pos: number): number {
  const s = splice(before, after);
  if (pos <= s.start) return pos;
  if (pos >= s.aEnd) return pos + (s.bEnd - s.aEnd);
  return s.bEnd;
}
