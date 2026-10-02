// Strings for the manual-route (E3) and captures (E5) panels, EN then zh-HK. No digits.
import { label } from "../i18n/label";

export const H = {
  manualTitle: label("Manual route against the agent route", "人手流程與代理流程比較"), // NEEDS-REVIEW zh-HK
  manualIntro: label("Route M is the holder by hand; route A is the agent flow. Steps and seconds per timed run.", "M 是持卡人人手操作；A 是代理流程。每次計時記錄步驟與秒數。"), // NEEDS-REVIEW zh-HK
  pending: label("pending: not captured yet", "待補：尚未擷取"), // NEEDS-REVIEW zh-HK
  belowSample: label("Below the planned sample: more timed runs or runners needed before a median means much.", "未達預定樣本：需要更多計時或更多操作者，中位數才有意義。"), // NEEDS-REVIEW zh-HK
  sampleMet: label("Planned sample reached.", "已達預定樣本。"), // NEEDS-REVIEW zh-HK
  route: label("Route", "流程"), // NEEDS-REVIEW zh-HK
  run: label("Run", "次序"), // NEEDS-REVIEW zh-HK
  steps: label("Steps", "步驟"), // NEEDS-REVIEW zh-HK
  decide: label("Decide, seconds", "決定（秒）"), // NEEDS-REVIEW zh-HK
  issue: label("Issue, seconds", "發卡（秒）"), // NEEDS-REVIEW zh-HK
  median: label("Median and range", "中位數及範圍"), // NEEDS-REVIEW zh-HK
  noValue: label("not recorded", "未有記錄"), // NEEDS-REVIEW zh-HK
  dropped: label("rows could not be read and are left out", "行無法讀取，已略去"), // NEEDS-REVIEW zh-HK
  capturesTitle: label("Observed captures", "實地擷取"), // NEEDS-REVIEW zh-HK
  capturesIntro: label("Values a teammate saw on a public page, with the time and who saw them. Screenshots stay out of the repo unless redacted.", "隊友在公開網頁看到的數值，附時間及擷取者；截圖除非已遮蓋，否則不入庫。"), // NEEDS-REVIEW zh-HK
  declineTitle: label("The one real card decline", "唯一一次真實卡拒絕"), // NEEDS-REVIEW zh-HK
  declinePending: label("pending: the real-card test has not been run. The rail stays SIMULATED.", "待補：尚未進行真卡測試，發卡層仍屬模擬。"), // NEEDS-REVIEW zh-HK
  declineCode: label("Decline code", "拒絕代碼"), // NEEDS-REVIEW zh-HK
  declineMessage: label("Message shown", "顯示訊息"), // NEEDS-REVIEW zh-HK
  declineWhere: label("Where it showed", "顯示位置"), // NEEDS-REVIEW zh-HK
  declineSeconds: label("Seconds from submit to decline, one sample", "提交至拒絕的秒數（單一樣本）"), // NEEDS-REVIEW zh-HK
  redacted: label("Redacted copy", "已遮蓋副本"), // NEEDS-REVIEW zh-HK
  unreadable: label("This evidence file could not be read, so nothing from it is shown.", "無法讀取此證據檔案，因此不顯示其內容。"), // NEEDS-REVIEW zh-HK
} as const;
