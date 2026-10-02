// Strings for voice input in the Ask sheet (lane B polish). Same rules as runMore.ts: no digits, user-facing words only
// (budget, rules, one-off card), no em dashes, and every zh-HK line is a draft marked NEEDS-REVIEW for the native read.
import { label } from "./label";

export const VOICE = {
  // The mic button (its name stays the same while it listens; aria-pressed carries the on state)
  speak: label("Speak your request", "講出你的要求"), // NEEDS-REVIEW

  // The status line under the field
  listening: label("Listening...", "聆聽緊..."), // NEEDS-REVIEW
  noSpeech: label("I didn't hear anything. Try again.", "聽唔到任何聲音，請再試一次。"), // NEEDS-REVIEW
  denied: label("Microphone is blocked. You can type instead, or allow it in your browser settings.", "麥克風被封鎖咗。你可以改為打字，或者喺瀏覽器設定允許使用。"), // NEEDS-REVIEW
  offline: label("Speech service isn't reachable right now. You can type instead.", "暫時連接唔到語音服務。你可以改為打字。"), // NEEDS-REVIEW
  error: label("Voice input isn't working here. You can type instead.", "呢度用唔到語音輸入。你可以改為打字。"), // NEEDS-REVIEW

  // Shown once, before the first listen
  firstUseNote: label("Uses your browser's speech service. Audio may leave this device.", "使用瀏覽器的語音服務。音訊可能會離開這部裝置。"), // NEEDS-REVIEW
} as const;
