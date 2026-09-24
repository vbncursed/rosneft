/**
 * `fn`, answering its last result again while every argument is the same
 * reference (`Object.is`).
 *
 * `pageProps` is a pure function the viewer calls on every render (a panel
 * fold, a search keystroke), and `ViewerCanvas` is memoised. An object built
 * fresh here would re-render the whole three.js scene for a click that changed
 * nothing in it.
 *
 * ponytail: one slot, module-level. That is right for the one viewer on screen;
 * a second live caller would thrash it (still correct, just uncached).
 */
export function memoLast<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let last: { args: A; result: R } | null = null;
  return (...args: A): R => {
    const prev = last;
    if (prev && prev.args.length === args.length && prev.args.every((a, i) => Object.is(a, args[i]))) {
      return prev.result;
    }
    const result = fn(...args);
    last = { args, result };
    return result;
  };
}
