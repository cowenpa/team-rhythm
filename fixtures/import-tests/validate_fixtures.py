"""Validate the authored answer key and its source evidence; this does not call AI."""
import json
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
data = json.loads((HERE / "expected-results.json").read_text())
member_ids = {member["id"] for member in data["members"]}
cases = {case["id"]: case for case in data["cases"]}

for case in cases.values():
    source = (HERE / case["source_file"]).read_text()
    tasks = case["tasks"]
    assert len(tasks) == case["summary"]["tasks"], case["id"]
    assert len({task["id"] for task in tasks}) == len(tasks), case["id"]
    for status, count_key in (("ready", "ready"), ("needs_clarification", "needs_clarification")):
        assert sum(task["status"] == status for task in tasks) == case["summary"][count_key], case["id"]
    for task in tasks:
        assert task["owner"] is None or task["owner"] in member_ids, task["id"]
        assert task["source_excerpt"] in source, task["id"]
        if task["due_date"]:
            date.fromisoformat(task["due_date"])
        if task["status"] == "ready":
            assert task["owner"] and task["due_date"], task["id"]

messy = cases["messy_transcript"]
messy_tasks = {task["id"]: task for task in messy["tasks"]}
anchor = date.fromisoformat(messy["source_date"])
assert anchor.weekday() == 3, "Transcript must be anchored to Thursday"
assert messy_tasks["T1"]["due_date"] == (anchor + timedelta(days=7)).isoformat()
assert messy_tasks["T2"]["due_date"] == (anchor + timedelta(days=1)).isoformat()
assert messy_tasks["T6"]["due_date"] is None
assert messy_tasks["T7"]["owner"] is None

postponed = cases["email_postponed_deadline"]["tasks"][0]
assert postponed["due_date"] == (date.fromisoformat(postponed["original_due_date"]) + timedelta(days=14)).isoformat()
earlier = cases["email_earlier_deadline"]["tasks"][0]
assert earlier["due_date"] < earlier["original_due_date"]
assert earlier["due_at"] == "2026-10-13T16:00:00+01:00"
conflict = cases["conflicting_unconfirmed_updates"]["tasks"][0]
assert conflict["due_date"] == conflict["last_confirmed_due_date"]
assert conflict["status"] == "needs_clarification"
undated = cases["missing_source_date"]
assert undated["source_date"] is None and undated["tasks"][0]["due_date"] is None

print(f"Validated {len(cases)} fictional cases, {sum(len(case['tasks']) for case in cases.values())} distinct task expectations, source excerpts and relative-date arithmetic.")
print("Messy transcript: 7 tasks; 5 ready; 2 require clarification. No live AI run performed.")

query_data = json.loads((HERE / "demo-ai-queries.json").read_text())
queries = query_data["questions"]
assert len({query["id"] for query in queries}) == len(queries)
valid_kinds = {"fact", "calculation", "inference", "partial", "insufficient_evidence"}
for query in queries:
    assert query["kind"] in valid_kinds, query["id"]
    source = (HERE / query["source_file"]).read_text()
    assert query["question"] and query["expected_answer"] and query["evidence"]
    for evidence in query["evidence"]:
        assert evidence["excerpt"] in source, (query["id"], evidence["excerpt"])
    if query["kind"] == "inference":
        assert query["required_uncertainty"], query["id"]

query_by_id = {query["id"]: query for query in queries}
ratings = [7, 7, 8, 8, 8, 8, 9, 9]
assert query_by_id["H3"]["expected_values"]["average"] == sum(ratings) / len(ratings)
assert query_by_id["H3"]["expected_values"]["distinct_respondents"] == 2
assert query_by_id["T1"]["expected_values"] == messy["summary"]
assert query_by_id["T2"]["expected_values"]["due_date"] == messy_tasks["T1"]["due_date"]
assert query_by_id["E1"]["expected_values"]["due_date"] == earlier["due_date"]
assert query_by_id["P1"]["expected_values"]["due_date"] == postponed["due_date"]
assert query_by_id["C1"]["expected_values"]["last_confirmed_due_date"] == conflict["due_date"]
print(f"Validated {len(queries)} AI question examples, source excerpts, calculation expectations and uncertainty labels.")
