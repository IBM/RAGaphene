# Copyright IBM Corp. 2023 - 2026
# SPDX-License-Identifier: Apache-2.0

# Standard
import argparse
import json
import logging
import os
import re
import string
from collections import Counter
from itertools import product
from typing import List, Optional

# Third Party
import evaluate

# Suppress noisy absl logging from rouge-score internals
logging.getLogger("absl").setLevel(logging.ERROR)

# --- Constants ---

METRICS = "metrics"
PIPELINES = "pipelines"
TASKS = "tasks"
RESULTS = "results"
PREDICTIONS = "predictions"
TARGETS = "targets"

# --- Scorer cache ---

# Module-level cache: avoids re-loading HuggingFace evaluator objects on
# repeated calls. Each scorer is loaded once and reused for the process lifetime.
_scorers: dict = {}


def _get_scorer(name: str):
    if name not in _scorers:
        _scorers[name] = evaluate.load(name)
    return _scorers[name]


# --- String helpers ---

def remove_articles(text: str) -> str:
    return re.sub(r"\b(a|an|the)\b", " ", text)


def normalize_white_spaces(text: str) -> str:
    return " ".join([x for x in text.split() if x])


def remove_punc(text: str) -> str:
    exclude = set(string.punctuation)
    return "".join(ch for ch in text if ch not in exclude)


def lower(text: str) -> str:
    return text.lower()


def normalize(txt: str) -> str:
    return normalize_white_spaces(remove_articles(remove_punc(lower(txt))))


# --- Scorers ---

def char_length(prediction: str) -> int:
    return len(prediction)


def f1(prediction: str, target: str) -> float:
    prediction_tokens = normalize(prediction).split()
    target_tokens = normalize(target).split()

    common_token = Counter(prediction_tokens) & Counter(target_tokens)
    num_common_tokens = sum(common_token.values())

    if num_common_tokens == 0:
        return 0

    p = 1.0 * num_common_tokens / len(prediction_tokens)
    r = 1.0 * num_common_tokens / len(target_tokens)
    return (2 * p * r) / (p + r)


def em(prediction: str, target: str) -> float:
    return int(normalize(prediction) == normalize(target))


def recall(prediction: str, target: str) -> float:
    prediction_tokens = normalize(prediction).split()
    target_tokens = normalize(target).split()

    common_token = Counter(prediction_tokens) & Counter(target_tokens)
    num_common_tokens = sum(common_token.values())

    if num_common_tokens == 0:
        return 0

    return 1.0 * num_common_tokens / len(target_tokens)


def rouge_l_max(predictions: List[str], targets: List[str]) -> float:
    """Batch rouge-l: one evaluator.compute() call over all (prediction, target)
    pairs, then take the max. Much faster than calling compute() per pair."""
    pairs = list(product(predictions, targets))
    flat_predictions = [p for p, _ in pairs]
    flat_targets = [t for _, t in pairs]

    rouge_evaluator = _get_scorer("rouge")
    scores = rouge_evaluator.compute(
        predictions=flat_predictions,
        references=flat_targets,
        rouge_types=["rougeL"],
        use_aggregator=False,
        use_stemmer=False,
    )
    return max(scores["rougeL"])


def bleu(predictions: List[str], targets: List[str]) -> float:
    """Create a fresh sacrebleu evaluator each call to avoid accumulating state
    across pipeline/task pairs. bleu() is called at most once per unit, so the
    overhead of loading is negligible compared to the statefulness bug it fixes."""
    bleu_evaluator = evaluate.load("sacrebleu")
    bleu_evaluator.add_batch(predictions=predictions, references=targets)
    score = bleu_evaluator.compute()
    return score["score"]


# --- Progress helpers ---

def write_progress(progress_path: str, completed: int, total: int) -> None:
    """Atomic write: write to a temp file then os.replace() so the Node.js
    GET handler never reads a half-written JSON file."""
    tmp = progress_path + ".tmp"
    with open(tmp, mode="w", encoding="utf-8") as fp:
        json.dump({"completed": completed, "total": total}, fp)
    os.replace(tmp, progress_path)


# --- Evaluation runner ---

def run(
    experiment: dict,
    progress_path: Optional[str] = None,
    total_items: int = 0,
) -> dict:
    """Run evaluations over all tasks and pipelines in the experiment dict.

    One progress unit = one pipeline's metrics for one task. Progress is written
    after each unit so the caller can poll without waiting for the full batch.
    """
    completed = 0

    for entry in experiment[TASKS]:
        for pipeline in experiment[PIPELINES]:
            evaluations = {}
            predictions = entry[pipeline][PREDICTIONS]
            targets = entry[pipeline][TARGETS]

            # Materialize all (prediction, target) pairs once; reused by f1/em/recall.
            pairs = list(product(predictions, targets))

            for metric in experiment[METRICS]:
                if metric == "char_length":
                    evaluations[metric] = round(
                        max(char_length(prediction=p) for p in predictions),
                        2,
                    )
                elif metric == "f1":
                    evaluations[metric] = round(
                        max(f1(p, t) for p, t in pairs),
                        2,
                    )
                elif metric == "em":
                    evaluations[metric] = round(
                        max(em(p, t) for p, t in pairs),
                        2,
                    )
                elif metric == "recall":
                    evaluations[metric] = round(
                        max(recall(p, t) for p, t in pairs),
                        2,
                    )
                elif metric == "rouge-l":
                    evaluations[metric] = round(
                        rouge_l_max(predictions, targets),
                        2,
                    )
                elif metric == "bleu":
                    evaluations[metric] = round(
                        bleu(predictions=predictions, targets=targets),
                        2,
                    )

            entry[pipeline]["results"] = evaluations

            completed += 1
            if progress_path:
                write_progress(progress_path, completed, total_items)

    return experiment


# --- Entry point ---

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input-path",
        type=str,
        dest="input_path",
        required=True,
        help="Path to the input JSON file for evaluations",
    )
    parser.add_argument(
        "--output-path",
        type=str,
        dest="output_path",
        required=True,
        help="Path where evaluation results will be written",
    )
    parser.add_argument(
        "--progress-path",
        type=str,
        dest="progress_path",
        required=True,
        help="Path for atomic progress updates (JSON: {completed, total})",
    )

    args = parser.parse_args()

    try:
        with open(args.input_path, mode="r", encoding="utf-8") as fp:
            setup = json.load(fp)

        total = len(setup[TASKS]) * len(setup[PIPELINES])
        logging.info(
            "Starting evaluation: tasks=%d pipelines=%d metrics=%d total_units=%d",
            len(setup[TASKS]),
            len(setup[PIPELINES]),
            len(setup[METRICS]),
            total,
        )

        results = run(
            experiment=setup,
            progress_path=args.progress_path,
            total_items=total,
        )

        with open(args.output_path, mode="w", encoding="utf-8") as fp:
            json.dump(results, fp)

        logging.info("Evaluation complete. Results written to %s", args.output_path)

    except Exception:
        logging.exception("Evaluation failed")
        raise
