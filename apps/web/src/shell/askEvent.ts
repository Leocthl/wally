// A screen that has no handle on the shell (Wally's screen can be mounted alone) asks it to open the Ask sheet by
// dispatching this event on window; the shell listens for it. Kept apart from the screens so the shell does not pull a
// lazy screen's chunk in just to name the event.
export const ASK_EVENT = "wally:ask";
