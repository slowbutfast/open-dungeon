# Mock narrator scripts

Each file is an ordered list of status lines the scriptable mock narrator emits,
one per turn. Feed one to `tests/probe_runner.py` with `--mock-script-file` so a
probe replays a fixed sequence of locations instead of whatever a real model
invents — that determinism is what makes a spatial-graph assertion meaningful.

| Script | What it exercises |
| :--- | :--- |
| `sample.json` | Three rooms in a straight line. The smallest useful run. |
| `probe-a-selfloop.json` | Returns to `Western Clearing` on turn 4. Guards the fix for the fabricated `room --dir--> room` self-loop. |
| `probe-portal-repro.json` | Boards a ship, then lands in a cell. Guards portal edges getting no inferred reverse. |

Run one:

```bash
python3 tests/probe_runner.py run \
  --probes demo \
  --mock 1 \
  --mock-script-file tests/fixtures/mock_scripts/probe-a-selfloop.json
```

Probes write saves under `game/playtest/adventures/probe-<name>/`, which is
gitignored. `--max-concurrent N` bounds how many probe servers run at once.
