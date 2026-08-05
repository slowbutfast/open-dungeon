import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe_runner import Probe

# Proof-of-mission gate: mission A (backtracking determinism) via the scripted
# narrator (--mock-script-file probe-a.json). Each turn the scripted narrator
# emits the next canonical status line; the spatial resolver should form a real
# room graph and the return leg should resolve deterministically (no dups).

def main():
    with Probe("probe-a", mock=True,
               mock_script_file="game/playtest/scripts/probe-a.json") as p:
        p.init()
        script = [
            "go west", "go north", "go east", "go south", "go south",
        ]
        print("=== turn-by-turn ===")
        for i, action in enumerate(script, 1):
            r = p.action(action)
            print(f"turn {i}: action={action!r} -> location={r.get('location')!r} moves={r.get('moves')}")
            m = p.request("GET", "/api/map")
            rooms = m.get("rooms", [])
            edges = m.get("edges", [])
            print(f"  rooms={[x['name'] for x in rooms]} edges={[(e['from'][:8], e['direction'], e['to'][:8], e['kind'], e['inferred']) for e in edges]} current={m.get('current_room_id')}")

        print("=== final map ===")
        m = p.request("GET", "/api/map")
        rooms = m.get("rooms", [])
        edges = m.get("edges", [])
        regions = m.get("regions", [])
        names = sorted(x["name"] for x in rooms)
        print(f"rooms: {names}")
        print(f"room count: {len(rooms)} (expect 3, no dups)")
        print(f"regions: {regions}")
        print(f"edges: {len(edges)} (expect 6: 3 confirmed + 3 inferred)")
        for e in edges:
            print(f"  {e['from'][:10]} --{e['direction']}-->{e['to'][:10]} kind={e['kind']} inferred={e['inferred']}")

        state = p.state()
        print(f"final state: location={state.get('location')!r} current_room_id={state.get('current_room_id')}")

        # Gate checks
        ok_rooms = len(rooms) == 3
        ok_edges = len(edges) == 6
        ok_return = state.get("location") == "Western Clearing"
        ok_no_dup = len(names) == len(set(names))
        print("\n=== GATE ===")
        print(f"3 rooms, no dups: {ok_rooms and ok_no_dup}")
        print(f"6 edges (3+3 inferred): {ok_edges}")
        print(f"return leg resolves to Western Clearing: {ok_return}")
        print(f"ALL PASS: {ok_rooms and ok_edges and ok_return and ok_no_dup}")
        return 0 if (ok_rooms and ok_edges and ok_return and ok_no_dup) else 1

if __name__ == "__main__":
    sys.exit(main())
