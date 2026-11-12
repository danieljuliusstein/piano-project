from __future__ import annotations

import argparse
import json
from pathlib import Path

from harmonic_stft_hmm import analyse, build_events
from score_models import get_score_model


def build_result(audio_path: str, model_name: str) -> dict:
    model = get_score_model(model_name)
    verdicts, _evidence = analyse(audio_path, model_name)
    score_events = build_events(model)
    events = []

    for event, verdict in zip(score_events, verdicts):
        events.append(
            {
                "event": event.index,
                "start_beat": event.start_beat,
                "beats": event.beats,
                "status": verdict.status,
                "expected": list(verdict.expected),
                "observed": list(verdict.observed),
                "start_seconds": verdict.start_seconds,
                "end_seconds": verdict.end_seconds,
                "margin_db": (
                    verdict.margin_db
                    if verdict.margin_db != float("-inf")
                    else None
                ),
            }
        )

    expected = sum(len(event["expected"]) for event in events)
    correct = sum(
        len(set(event["expected"]) & set(event["observed"]))
        for event in events
    )
    missing = sum(
        len(set(event["expected"]) - set(event["observed"]))
        for event in events
    )
    wrong = sum(
        1
        for event in events
        if event["status"] == "wrong"
    )
    insertions = sum(
        len(set(event["observed"]) - set(event["expected"]))
        for event in events
    )
    precision_denominator = correct + insertions
    recall_denominator = correct + missing
    precision = correct / precision_denominator if precision_denominator else 0.0
    recall = correct / recall_denominator if recall_denominator else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision + recall
        else 0.0
    )

    return {
        "source": Path(audio_path).name,
        "model": model.name,
        "reference_bpm": model.reference_bpm,
        "events": events,
        "pitch": {
            "score": round(f1 * 100),
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "correct": correct,
            "expected": expected,
            "missing": missing,
            "wrong": wrong,
            "insertions": insertions,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", required=True)
    arguments = parser.parse_args()
    print(json.dumps(build_result(arguments.audio, arguments.model)))


if __name__ == "__main__":
    main()
