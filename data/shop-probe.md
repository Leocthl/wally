# Shop probe

Protocol and pre-set rule: [docs/05-evidence-plan.md](../docs/05-evidence-plan.md#shop-readiness-probe). Read-only, human-paced, no purchase, no account, no card details, no bypassing of challenges.

- **Rule frozen at (UTC+8)**: ________ by ________ (fill before the first row; no edits after)
- **Hostile to agents** [F81]: no guest checkout, OR a bot challenge before the payment step, OR no total (shipping included) before the pay button. Mastercard prepaid acceptance is recorded, not counted.
- **Threshold** [F39]: the shop-side claim stands only if at least 4 of 10 stores are hostile.
- **Store list fixed before the first visit.** No swaps, except a ToS exclusion with the reason in notes.

| store | URL | guest checkout | total before pay | bot challenge | accepts MC prepaid | hostile? | probed at | by | notes |
|---|---|---|---|---|---|---|---|---|---|
| EXAMPLE, delete | https://... | yes / no | yes / no | none / type + step | yes / no / unclear | yes / no | YYYY-MM-DD HH:MM | initials | terms read (yes / no); step where stopped |

- **Cell values**: `guest checkout` yes = cart to payment step with no account. `total before pay` yes = total incl. shipping visible before the pay button. `bot challenge` = CAPTCHA, interstitial check or verify-human prompt, with the step where it appeared. `accepts MC prepaid` yes = Mastercard listed and no prepaid exclusion; `unclear` = generic "card" only.
- **Tally**: hostile ___ of 10. Shop-side claim stands: yes / no.
- **Also report** (not part of the rule): stores accepting MC prepaid ___ of 10.
