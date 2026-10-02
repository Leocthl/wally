# Third-party software, models and fonts

- **Why**: open-source libraries and frameworks are allowed if credited [F16]. A dependency or model enters this file in the same commit that adds it (X-19).
- **Status**: in use, planned (named in the plan, not yet installed) or optional (only if a key ever appears). "Verify when added" marks a licence not yet checked against the installed package.

## Models
| Name | Author | Licence | Use | Status |
|---|---|---|---|---|
| Laya `typed-decisions` checkpoint (huggingface.co/convaiinnovations/laya) | Convai Innovations | Apache-2.0 [F11c] | judge questions and planner decisions, on the demo laptop | in use |
| ModernBERT-large, the encoder architecture inside that checkpoint [F11c] | Answer.AI and LightOn | Apache-2.0, verify when added | inside the checkpoint | in use |
| Qwen3.5-9B (huggingface.co/Qwen/Qwen3.5-9B), as the GGUF Q4_K_M quant `Qwen_Qwen3.5-9B-Q4_K_M.gguf` from huggingface.co/bartowski/Qwen_Qwen3.5-9B-GGUF, commit 182be2fd6c7bc44887d88a91cb03ff009cc9f549 | Qwen team, Alibaba Cloud (quant: bartowski) | Apache-2.0 (model card and quant card) | Wally's local planner and sentence-to-rules compiler, on the demo laptop; never a judge | in use |
| Qwen3.5-4B (huggingface.co/Qwen/Qwen3.5-4B), as `Qwen_Qwen3.5-4B-Q4_K_M.gguf` from huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF, commit 4168f45a16a1290d65a4ec0fa312ae917a4c15d6 | Qwen team, Alibaba Cloud (quant: bartowski) | Apache-2.0 (model card and quant card) | smaller, faster alternative for the same two jobs (`QWEN_MODEL=4b`) | in use |

## Laya server (`services/laya/`, Python venv not committed)
| Package | Licence | Use |
|---|---|---|
| laya 0.3.23 with the `serve` extra (github.com/NandhaKishorM/laya) [F11c] | Apache-2.0 | `laya-serve` HTTP server |
| PyTorch | BSD-3-Clause | inference |
| Transformers | Apache-2.0 | tokenizer and encoder |
| safetensors | Apache-2.0 | weight loading |
| huggingface_hub, hf-xet | Apache-2.0, verify when added | one-time checkpoint download |
| NumPy | BSD-3-Clause | numerics |
| FastAPI, Starlette | MIT, BSD-3-Clause | HTTP |
| Uvicorn | BSD-3-Clause | HTTP server |
| Pydantic | MIT | request validation |
| uv | MIT or Apache-2.0 | setup tool |

- The full resolved list is saved with the Laya run in `services/laya/`; every other package there is a transitive dependency of the rows above.

## Qwen server (`services/qwen/`, weights not committed)
| Software | Licence | Use |
|---|---|---|
| llama.cpp `llama-server` and ggml (github.com/ggml-org/llama.cpp), Homebrew bottle 0.4.1, build 10964 | MIT | loopback HTTP server for the Qwen GGUF files, Metal backend |
| curl (system) | curl licence (MIT-style) | one-time verified download in `fetch_model.mjs` |

## JavaScript and TypeScript
| Package | Version | Licence | Use | Status |
|---|---|---|---|---|
| @noble/curves | 2.4.0 | MIT | Ed25519 | in use |
| @noble/hashes | 2.4.0 | MIT | SHA-256 | in use |
| @scure/base | 2.4.0 | MIT | base58btc and multibase | in use |
| canonicalize | 5.1.0 | Apache-2.0 | RFC 8785 JSON canonicalisation (the reference implementation) | in use |
| ajv, ajv-formats | 8.x, 3.0 | MIT | JSON Schema validation | in use |
| React, react-dom | 19.3 | MIT | UI | in use |
| Hono, @hono/node-server | 4.13, 2.1 | MIT | thin API | in use |
| TypeScript | 6.0 | Apache-2.0 | language | in use |
| Vite, @vitejs/plugin-react | 8.3, 6.1 | MIT | build and dev server | in use |
| Vitest, @vitest/coverage-v8 | 5.0 | MIT | tests and the coverage gate | in use |
| fast-check | 4.10 | MIT | property tests | in use |
| tsx | 4.23 | MIT | run TypeScript scripts (harness, judge fit) | in use |
| json-schema-to-typescript | 16.0 | MIT | types from schemas | in use |
| ESLint, typescript-eslint, @eslint/js, globals | 10.11, 8.71, 10.0, 17.13 | MIT | lint and import-boundary rules | in use |
| Playwright Test | 1.63 | Apache-2.0 | browser smoke tests (browsers come from the local cache, none are shipped) | in use |
| Testing Library (react, dom, jest-dom, user-event) | 16.3, 10.4, 7.0, 14.6 | MIT | component tests | in use |
| jsdom | 30.1 | MIT | DOM for component tests | in use |
| @types/node, @types/react, @types/react-dom | 22.20, 19.3, 19.3 | MIT | type definitions | in use |
| Capacitor (@capacitor/core, cli, ios, android) | 8.5 | MIT | native iOS and Android shells around the web build (apps/mobile) | in use |
| Capacitor plugins (@capacitor/app, haptics, splash-screen, status-bar) | 8.1, 8.0, 8.0, 8.0 | MIT | Android back button, native haptics, splash and status bar in the shells | in use |
| uqr | 0.1.3 | MIT | QR codes as SVG for the phone pairing links, rendered on the booth server (LAN mode), no dependencies | in use |
| @capacitor/assets | 3.0 | MIT | dev tool: icon and splash sets for both shells | in use |
| @number-flow/react (with number-flow) | 0.6.2 | MIT | rolling digits for the budget amount on Budget; plain text where the browser cannot draw it; no network | in use |
| @axe-core/playwright (with axe-core) | 4.13 | MPL-2.0 | dev tool: accessibility checks of every screen in the Playwright run; not shipped in the app | in use |
| sharp | 0.34 | Apache-2.0; its libvips binaries (npm packages @img/sharp-libvips-*) are LGPL-3.0-or-later | dev tool only, renders the icon masters; not shipped in the apps | in use |
| esbuild | 0.28 | MIT | bundles the native bridge script | in use |
| pnpm | 12.3 | MIT | package manager and workspace tool, not shipped | in use |
| AndroidX (appcompat, core, core-splashscreen, webkit, activity, fragment, coordinatorlayout) and Android Gradle Plugin 8.13 | per Capacitor 8 | Apache-2.0 | Android shell, resolved by Gradle from Google and Maven Central | in use |
| capacitor-swift-pm (Capacitor and Cordova xcframeworks for iOS) | 8.5 | MIT, Apache-2.0 (Cordova) | iOS shell, resolved by SwiftPM | in use |
| Gradle wrapper (`gradlew` scripts and `gradle-wrapper.jar`, Gradle 8.14.3), committed under `apps/mobile/android/` | 8.14 | Apache-2.0 | builds the Android shell | in use |

## Fonts
| Font | Author | Licence | Use |
|---|---|---|---|
| Noto Sans HK | Google | SIL Open Font License 1.1 | named in the CSS font stack as a fallback for Chinese text when the device has it; no font file is bundled |

- The UI uses system font stacks only (the booth is offline). PingFang HK (Apple) and Microsoft JhengHei are system fonts named in the stack and never shipped.

## Submission film and deck (tools, not part of the repo or the app)
| Tool | Author | Licence | Use |
|---|---|---|---|
| onetake (Claude skill) | Patrick (feitangyuan) | PolyForm Noncommercial 1.0.0 | renders the motion film; installed outside the repo and never copied into it; hackathon use is noncommercial |
| ElevenLabs text-to-speech (free plan, voice Alice, model eleven_flash_v2_5) | ElevenLabs | service terms, free plan needs attribution | narration of the film: "Voice by ElevenLabs"; no audio from it is stored in this repo |
| pptxgenjs 4.0.1 | Brent Ely and contributors | MIT | builds the editable PowerPoint deck |
| Playwright, ffmpeg | Microsoft; FFmpeg project | Apache-2.0; LGPL/GPL build | record the app and encode the film |

- Film and music: original, synthesised in code for this film; no sample, loop or stock track. The film and deck files live outside git (`submission/`, gitignored).

## Not included
- No third-party logos, brand assets or page content. Public sources are cited in `docs/facts-register.md`, not redistributed.
- No third-party icon set, illustration or sound: the line icons, the Wally character and the app icons are drawn in this repo (`apps/web/src/ui/icons.tsx`, `apps/web/src/wally/`).
