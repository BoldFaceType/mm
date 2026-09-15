# Verification artifacts

Everything here is generated. Nothing is hand-written evidence.

## Gate logs — `gates/`

| File | What it is |
| --- | --- |
| `00-baseline-master-RED.txt` | Unit suite against unmodified master (`f957768`). 5 pass / 12 fail. |
| `01-pr1-GREEN.txt` | After PR1 (GGUF decoding). |
| `02-pr2-GREEN.txt` | After PR2 (numerics). |
| `03-pr3-GREEN.txt` | After PR3 (tensor picker). |
| `04-pr4-GREEN.txt` | After PR4 (lazy decode). |
| `05-pr5-GREEN.txt` | After PR5 (load lifecycle). |
| `browser-before.json` | Browser observations against unmodified master. |
| `browser-after.json` | Browser gates against the integrated tree. |

## Screenshots — `screenshots/before/` and `screenshots/after/`

Same script, same fixtures, same viewport, two trees. Pairs:

| Shot | Before (master `f957768`) | After |
| --- | --- | --- |
| `B0-harness` | softmax `[0,0]`; `map()` throws `n is not defined`; Q4_0 worst relative error 3.51 | all three correct; Q4_0 error < 1e-5 |
| `B1-default-scene` | renders | renders |
| `B2-tensor-picker` | no picker element exists | 8 tensors listed with dims, type, decoded size |
| `B3-tensor-loaded` | nothing loads; status empty; no tensor in URL | tensor in the scene, named in the status line and the URL |
| `B4-unsupported-blocked` | no listing at all | `bad.q4_k` shown greyed, "Q4_K not decodable" |
| `B5-error-state` | no load state to report | error state with message |
| `B6-softmax-epilog` | not observable | distribution summing to 1 |

## Reproducing

```
python3 tests/fixtures/make_fixtures.py     # regenerate fixtures + reference vectors
npm run check:syntax
npm test                                    # 42 unit gates
npm run test:browser                        # 14 browser gates + screenshots
```

The browser gates need Playwright and a Chromium build. Set
`PLAYWRIGHT_EXECUTABLE` if the installed Playwright and the available browser
build disagree.

To regenerate the "before" column, check `f957768` out into a worktree, copy
`tests/browser` and `tests/fixtures` into it, and run:

```
node tests/browser/run-browser-gates.mjs --observe-only --label before
```
