# Photo reader evaluation 2026-10-03

- **Status**: MEASURED(n=29) on 29 Hong Kong retailer product photos (model shots and flat lays), one annotator. Tuned on the same 29 photos (prompt wording, a legend of the kind words, the picture token budget): there is no held-out set, so treat the rates as an upper bound.
- **Run**: 2026-10-03T04:20:09.085Z to 2026-10-03T04:21:21.917Z; host Apple M5 Pro 48 GB; llama.cpp b10964-b29c606e2; one request at a time after 2 warm-up calls; --image-max-tokens 512, --cache-ram 0.
- **Input**: each photo re-encoded the way the page does it (long edge 1024 px, JPEG quality 85, metadata dropped) and sent through `describeImage` (grammar of fixed words, 15 s limit, temperature 0, seed 42). The photos stay on the booth Mac and are not in the repository; this file holds no file names, brand names or product names.
- **Labels**: written before any tuning, kept next to the photos. Kind = the garment the product page names (accepted synonyms for that one item, for example jeans or trousers for cargo pants). Colour = the main colour of that garment as seen (a few close words accepted where two are fair). Outfit shots show other garments too: the lenient kind rate also accepts a clearly visible large garment.
- **Machine load**: 1-minute load average 4.6 to 6.14 during the run (other work shares the machine).

## Results
| Metric | Value |
| --- | --- |
| Valid answers | 29/29 (1.00) |
| Kind correct (the product's garment) | 25/29 (0.86) |
| Kind correct, any clearly visible garment | 28/29 (0.97) |
| Main colour: first colour exact | 25/29 (0.86) |
| Main colour: first colour exact or an accepted close word | 27/29 (0.93) |
| Main colour anywhere in the answer's list | 27/29 (0.93) |
| Latency p50 / p95 / max, ms | 2148 / 2449 / 2501 (n=29) |
| Colour plates only (no model): main colour first, accepted word | 21/29 (0.72) |
| Colour plates only: main colour within the first two | 25/29 (0.86) |
| Server memory (physical footprint), before / after the run | 2323 MB / 2385 MB |

- **Note**: Prompt wording was tuned on these same photos in four passes, so there is no held-out set. Plain wording: kind 22 of 29. A legend of the kind words: kind 25 of 29. Plus the colour, pattern and fit words: main colour exact 22 to 25 of 29. Plus the style words: no change. A wording that told the model it could answer not_clothing made it do so for 23 of 29 clothes; the final wording names that word only with its meaning.
- **Note**: Picture token budget, tried on the kind-legend wording: 256, 512 and 1024 tokens gave kind 24, 25 and 25 of 29 with median latency 1.7, 2.3 and 2.9 s. 512 is the booth setting.
- **Note**: Memory: llama-server keeps a RAM prompt cache (default 8192 MiB). With pictures it grew by about 175 MB per picture (4.2 GB after 24 pictures); the booth runs with --cache-ram 0, which stays at 2.2 GB after 24 pictures. Text-only planner smoke, same load, alternating servers: median 2.12 s with the cache off against 1.96 s with the default, then 2.19 s against 2.15 s (n=12 each).
- **Note**: Kind misses: three outfit shots where the product is a lower garment (jeans, cargo pants) but a top is the biggest piece in the picture, and one camisole read as a shirt. The page lets the person correct the kind with one tap.
- **Note**: Colour plates are the code-only path (CIELAB k-means on the page, no model): they name the product colour first for the share shown above, and within the first two for the second share. They are the fallback, not the headline.

## Per photo (anonymised)
| # | Expected kind | Kind read | Ok | Expected colour | Colours read | Ok | Plates first | Ok | ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | tee | tee | yes | orange | orange | yes | orange | yes | 902 |
| 2 | tee | tee | yes | black | black | yes | black | yes | 2409 |
| 3 | tee | tee | yes | olive | olive | yes | olive | yes | 2162 |
| 4 | jacket | jacket | yes | green | green, black | yes | black | yes | 2224 |
| 5 | hoodie | hoodie | yes | grey | grey | yes | black | yes | 2317 |
| 6 | hoodie | hoodie | yes | yellow | yellow, white | yes | brown | yes | 2473 |
| 7 | jacket | jacket | yes | denim | blue, denim | yes | denim | yes | 2501 |
| 8 | jeans | hoodie | other garment | brown | blue, grey, black | no | grey | no | 2414 |
| 9 | jeans | shirt | other garment | brown | blue, yellow, cream | no | brown | yes | 2379 |
| 10 | trousers | shirt | other garment | olive | olive, black | yes | brown | yes | 2315 |
| 11 | tee | tee | yes | blue | blue | yes | brown | no | 2148 |
| 12 | tee | tee | yes | pink | pink | yes | grey | no | 2229 |
| 13 | other | shirt | no | red | red | yes | red | yes | 2035 |
| 14 | dress | dress | yes | cream | cream | yes | white | yes | 2095 |
| 15 | dress | dress | yes | black | black | yes | black | yes | 2266 |
| 16 | sweater | sweater | yes | black | black | yes | black | yes | 2208 |
| 17 | sneakers | sneakers | yes | white | white | yes | white | yes | 2126 |
| 18 | sneakers | sneakers | yes | green | green, white, beige | yes | white | no | 2289 |
| 19 | sneakers | sneakers | yes | beige | beige, brown, grey | yes | white | no | 2194 |
| 20 | tee | tee | yes | navy | blue | yes | grey | yes | 2124 |
| 21 | tee | tee | yes | green | green, white, pink | yes | white | no | 2107 |
| 22 | polo | polo | yes | light_blue | light_blue, navy | yes | light_blue | yes | 2124 |
| 23 | shirt | shirt | yes | light_blue | light_blue | yes | light_blue | yes | 2113 |
| 24 | sweater | sweater | yes | light_blue | light_blue | yes | white | no | 2131 |
| 25 | jacket | jacket | yes | navy | navy, cream, white | yes | light_blue | no | 2114 |
| 26 | tee | tee | yes | blue | blue | yes | denim | yes | 2010 |
| 27 | tee | tee | yes | white | white, black | yes | white | yes | 2086 |
| 28 | tee | tee | yes | grey | grey | yes | grey | yes | 2089 |
| 29 | tee | tee | yes | black | black, light_blue | yes | black | yes | 2137 |
