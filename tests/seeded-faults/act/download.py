"""Download the ACT test case files into a local folder, for runs with no network.

Usage: python3 -I tests/seeded-faults/act/download.py tests/seeded-faults/act/cases.json tests/seeded-faults/act/cases

The files keep their relative path. Existing files are not downloaded again.
The rate is four requests each second. The folder is in .gitignore, because
the files are W3C content and the list in cases.json is the record.
"""
import json
import os
import sys
import time
import urllib.request


def main(cases_path, out_dir):
    with open(cases_path, encoding="utf-8") as f:
        cases = json.load(f)["cases"]
    done = skipped = failed = 0
    for case in cases:
        target = os.path.join(out_dir, case["path"])
        if os.path.exists(target):
            skipped += 1
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        try:
            req = urllib.request.Request(case["url"], headers={"User-Agent": "accessibility-audit seeded-faults fetch"})
            with urllib.request.urlopen(req, timeout=30) as r, open(target, "wb") as f:
                f.write(r.read())
            done += 1
        except Exception as e:  # noqa: BLE001
            failed += 1
            print("failed", case["url"], e)
        time.sleep(0.25)
    print(f"downloaded {done}, skipped {skipped}, failed {failed}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
