// Offline verifier page skeleton. No network calls: the log file is read locally (lane C wires verifyChain).
import "@laisee/core/verify";

const status = document.getElementById("status");
if (status) status.textContent = "Drop a log file to verify it offline (coming with lane C).";
