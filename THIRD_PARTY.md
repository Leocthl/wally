# Third-party software, models and fonts

- **Why**: open-source libraries and frameworks are allowed if credited [F16]. A dependency or model enters this file in the same commit that adds it (X-19).
- **Status**: in use, planned (named in the plan, not yet installed) or optional (only if a key ever appears). "Verify when added" marks a licence not yet checked against the installed package.

## Models
| Name | Author | Licence | Use | Status |
|---|---|---|---|---|
| Laya `typed-decisions` checkpoint (huggingface.co/convaiinnovations/laya) | Convai Innovations | Apache-2.0 [F11c] | judge questions and planner decisions, on the demo laptop | in use |
| ModernBERT-large, the encoder architecture inside that checkpoint [F11c] | Answer.AI and LightOn | Apache-2.0, verify when added | inside the checkpoint | in use |

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

## JavaScript and TypeScript
| Package | Licence | Use | Status |
|---|---|---|---|
| TypeScript | Apache-2.0 | language | planned |
| @noble/curves | MIT | Ed25519 | planned |
| @noble/hashes | MIT | SHA-256 | planned |
| @scure/base | MIT | base58btc | planned |
| ajv, ajv-formats | MIT | JSON Schema validation | planned |
| json-schema-to-typescript | MIT | types from schemas | planned |
| vitest | MIT | tests | planned |
| fast-check | MIT | property tests | planned |
| React | MIT | UI | planned |
| Vite | MIT | build | planned |
| Hono | MIT | thin API | planned |
| RFC 8785 JCS library | verify when added | canonical JSON | planned |
| @anthropic-ai/sdk | MIT, verify when added | optional claude planner | optional |

## Fonts
| Font | Author | Licence | Use |
|---|---|---|---|
| Noto Sans HK | Google | SIL Open Font License 1.1 | CJK UI text |

## Not included
- No third-party logos, brand assets or page content. Public sources are cited in `docs/facts-register.md`, not redistributed.
