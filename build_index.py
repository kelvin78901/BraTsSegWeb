import json
from pathlib import Path

def main():
    cases_dir = Path(__file__).resolve().parent / "viewer" / "cases"
    assert cases_dir.exists(), f"Not found: {cases_dir}"

    case_ids = sorted([
        p.name for p in cases_dir.iterdir()
        if p.is_dir() and not p.name.startswith(".")
    ])

    out = cases_dir / "index.json"
    out.write_text(json.dumps(case_ids, indent=2), encoding="utf-8")
    print(f"[OK] wrote {out} ({len(case_ids)} cases)")

if __name__ == "__main__":
    main()
