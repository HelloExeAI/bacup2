/** Single subscriber: whichever Today&apos;s Focus instance is mounted registers here so overview cards can open the same expanded panel. */

type Listener = () => void;

let listener: Listener | null = null;

export function setTodayFocusExpandedListener(fn: Listener | null) {
  listener = fn;
}

export function requestOpenTodayFocusExpanded() {
  listener?.();
}
