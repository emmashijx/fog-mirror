import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import statistics
import time
import urllib.error
import urllib.request
import uuid

import cv2

from prepare import ROOT


def api(base, path, payload=None):
    request = urllib.request.Request(
        base + path, data=payload,
        headers={"Content-Type": "image/jpeg"} if payload is not None else {},
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode("utf-8")) from error


def summary(values):
    ordered = sorted(values)
    return {
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "p95": ordered[int((len(ordered) - 1) * 0.95)],
        "max": ordered[-1],
    }


def memory_max(samples, key):
    return max((sample[key] for sample in samples if sample.get(key) is not None), default=None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--crop", nargs=4, type=int, metavar=("X", "Y", "WIDTH", "HEIGHT"))
    parser.add_argument("--frames", type=int, default=130)
    parser.add_argument("--start-seconds", type=float, default=0)
    parser.add_argument("--fps", type=float, default=30)
    parser.add_argument("--server", default="http://127.0.0.1:8766")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if args.frames <= 10 or args.fps <= 0:
        parser.error("Use more than 10 frames and a positive input FPS")
    health = api(args.server, "/api/fah/health")
    if health["state"] != "ready":
        raise RuntimeError(health["message"])
    capture = cv2.VideoCapture(str(args.video))
    if not capture.isOpened():
        raise RuntimeError(f"Cannot open {args.video}")
    capture.set(cv2.CAP_PROP_POS_MSEC, args.start_seconds * 1000)
    source = {
        "path": str(args.video.resolve().relative_to(ROOT)),
        "width": int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
        "height": int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        "fps": capture.get(cv2.CAP_PROP_FPS),
        "startSeconds": args.start_seconds,
        "crop": args.crop,
        "resize": [480, 320],
        "inputPacingFps": args.fps,
    }
    client = "benchmark-" + uuid.uuid4().hex
    samples = []
    started = time.perf_counter()
    try:
        for index in range(args.frames):
            remaining = started + index / args.fps - time.perf_counter()
            if remaining > 0:
                time.sleep(remaining)
            valid, frame = capture.read()
            if not valid:
                break
            if args.crop:
                left, top, width, height = args.crop
                if min(left, top) < 0 or min(width, height) <= 0 or (
                    left + width > frame.shape[1] or top + height > frame.shape[0]
                ):
                    raise ValueError("Crop is outside the input frame")
                frame = frame[top:top + height, left:left + width]
            frame = cv2.resize(frame, (480, 320))
            request_started = time.perf_counter()
            valid, image = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            if not valid:
                raise RuntimeError("JPEG encoding failed")
            result = api(args.server, "/api/fah/frame?client=" + client, image.tobytes())
            client_ms = (time.perf_counter() - request_started) * 1000
            samples.append({
                "frame": index,
                "sourceSeconds": args.start_seconds + index / source["fps"],
                "clientMs": client_ms,
                "handPoints": len(result["hand"]) if result["hand"] else 0,
                "tipCamera": result["tipCamera"],
                **result["metrics"],
            })
            if (index + 1) % 30 == 0:
                print(json.dumps({"frames": index + 1, **result["metrics"]}), flush=True)
        elapsed = time.perf_counter() - started
        service_report = api(args.server, "/api/fah/report")
    finally:
        capture.release()
        api(args.server, "/api/fah/reset?client=" + client, b"")
    measured = samples[10:]
    if not measured or not any(sample["handPoints"] == 21 for sample in measured):
        raise RuntimeError("No real hand predictions after warmup")
    model_times = [sample["modelMs"] for sample in measured]
    report = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "kind": "offline-video",
        "realFahInferenceCompleted": True,
        "source": source,
        "processedFrames": len(samples),
        "warmupFramesExcluded": 10,
        "measuredFrames": len(measured),
        "elapsedSeconds": elapsed,
        "deliveredFpsIncludingPacingAndWarmup": len(samples) / elapsed,
        "modelFps": 1000 / statistics.mean(model_times),
        "modelMs": summary(model_times),
        "jpegAndHttpMs": summary([sample["clientMs"] for sample in measured]),
        "memoryMiB": {
            "backend": measured[-1].get("memoryBackend"),
            "allocatedMax": memory_max(measured, "allocatedMiB"),
            "reservedMax": memory_max(measured, "reservedMiB"),
            "peakAllocated": memory_max(samples, "peakAllocatedMiB"),
            "sampledPeakAllocated": memory_max(samples, "sampledPeakAllocatedMiB"),
            "driverAllocatedMax": memory_max(measured, "driverAllocatedMiB"),
            "deviceUsedMax": memory_max(samples, "deviceUsedMiB"),
        },
        "framesWithSelectedHand": sum(sample["handPoints"] == 21 for sample in measured),
        "detectedHandsMean": statistics.mean(sample["hands"] for sample in measured),
        "serviceReport": service_report,
        "samples": samples,
        "limitations": [
            "Published demo video input panel; not a live webcam benchmark or an accuracy-labelled dataset.",
            "No fingertip ground truth or push/release annotations; hand availability is not accuracy.",
            "Model timing excludes JPEG, HTTP, browser face tracking and rendering.",
            "Joint-only adapter disables MANO dense surface reconstruction; not the full mesh pipeline.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key not in ("samples", "serviceReport")}, indent=2))


if __name__ == "__main__":
    main()
