import argparse
from collections import deque
from contextlib import suppress
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import statistics
import sys
import threading
import time
import traceback
from urllib.parse import parse_qs, urlparse

from prepare import DATA, ROOT, REVISION, prerequisites
from runtime import Runtime


UPSTREAM = ROOT / ".local" / "FAH"
sys.path.insert(0, str(UPSTREAM))


def strongest_hand_detector(detector):
    def detect(image):
        boxes, scores, sides = detector(image)
        if len(scores) <= 1:
            return boxes, scores, sides
        best = int(scores.argmax())
        return boxes[best:best + 1], scores[best:best + 1], sides[best:best + 1]

    return detect


class Engine:
    def __init__(self, device="auto"):
        self.lock = threading.Lock()
        self.state = "loading"
        self.message = "正在加载 FAH-S"
        self.model = None
        self.client = None
        self.samples = deque(maxlen=120)
        self.frames = 0
        self.nvml = None
        self.hardware = {}
        self.last_metrics = None
        self.requested_device = device
        self.runtime = None

    def load(self):
        try:
            import torch

            self.runtime = Runtime(torch, self.requested_device)
            self.hardware = self.runtime.hardware()
            status = prerequisites()
            if not status["ready"]:
                self.state = "missing_dependencies"
                self.message = (
                    "FAH-S 未就绪：缺少 SAM 配置；可运行 "
                    "tools/fah/prepare.py --config-source maccap 下载并校验，再重新选择本方案。"
                    if len(status["missing"]) == 1 and status["missing"][0].endswith("model_config.yaml")
                    else "缺少 FAH 依赖：" + "、".join(status["missing"])
                )
                return
            from fah import FAH

            # The mirror uses one hand. Skip extra proposals on the latency-sensitive MPS path.
            options = {"det_size": 384, "vd_propose": False} if self.runtime.device == "mps" else {}
            self.model = FAH(
                "fah-s", mode="video", device=self.runtime.device,
                weights=str((DATA / "weights").relative_to(ROOT)),
                sam3d=str((DATA / "sam-3d-body-dinov3").relative_to(ROOT)),
                mesh="none", tips=False, parts=False, contact=False,
                **options,
            )
            if self.runtime.device == "mps":
                method = self.model.method
                method.detector = method.est.detector = strongest_hand_detector(method.detector)
            keypoint_head = self.model.method.est.model.keypoint_head
            if getattr(keypoint_head, "dense_vidx", None) is not None:
                keypoint_head.dense_vidx = None
            if self.runtime.device == "cuda":
                try:
                    import pynvml

                    pynvml.nvmlInit()
                    self.nvml = (pynvml, pynvml.nvmlDeviceGetHandleByIndex(0))
                except Exception:
                    self.nvml = None
            self.state = "ready"
            self.message = f"FAH-S 已加载（{self.runtime.device}），等待摄像头；前 10 帧作为预热"
        except Exception as error:
            self.state = "error"
            self.message = str(error)
            traceback.print_exc()
        finally:
            print(json.dumps(self.status(), ensure_ascii=False), flush=True)

    def status(self):
        return {
            "state": self.state,
            "message": self.message,
            "model": "FAH-S",
            "mode": "video / mesh=none / tips=false / parts=false / contact=false",
            "surfaceReconstruction": False,
            "weightsRevision": REVISION,
            "requestedDevice": self.requested_device,
            "hardware": self.hardware,
            "prerequisites": prerequisites(),
        }

    def reset(self, client):
        if self.client != client:
            return
        self.model.reset()
        self.client = None

    def infer(self, encoded, client):
        import cv2
        import numpy as np
        import torch

        image = cv2.imdecode(np.frombuffer(encoded, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None or max(image.shape[:2]) > 1920:
            raise ValueError("无效图像或分辨率过大")
        if self.client != client:
            self.model.reset()
            self.client = client
            self.samples.clear()
            self.frames = 0
            self.started = time.perf_counter()
            self.runtime.reset_peak()
        self.model.method.t = (time.perf_counter() - self.started) * self.model.method.fps
        self.runtime.synchronize()
        started = time.perf_counter()
        with torch.inference_mode():
            hands = self.model(image)
        self.runtime.synchronize()
        elapsed = (time.perf_counter() - started) * 1000
        self.frames += 1
        if self.frames > 10:
            self.samples.append(elapsed)
        height, width = image.shape[:2]
        hand = max(hands, key=lambda value: float(value.get("score", 0)), default=None)
        result = {"hand": None, "handWorld": None, "tipCamera": None, "handPredicted": False}
        if hand is not None:
            # The upstream video refiner assigns zero score to frames filled from history.
            result["handPredicted"] = float(hand.get("score", 1)) == 0
            joints = np.asarray(hand["joints3d"], dtype=np.float64)
            pixels = np.asarray(hand["joints2d"], dtype=np.float64)
            if joints.shape != (21, 3) or pixels.shape != (21, 2):
                raise ValueError("FAH 返回了不符合预期的手部关键点")
            if not np.isfinite(joints).all() or not np.isfinite(pixels).all():
                raise ValueError("FAH 返回了无效坐标")
            focal = float(np.hypot(width, height))
            depth_scale = focal / max(abs(float(joints[0, 2])), 0.05)
            result["hand"] = [
                {"x": float(pixel[0] / width), "y": float(pixel[1] / height),
                 "z": float((joint[2] - joints[0, 2]) * depth_scale / width)}
                for pixel, joint in zip(pixels, joints)
            ]
            result["handWorld"] = [
                dict(zip(("x", "y", "z"), map(float, joint))) for joint in joints
            ]
            result["tipCamera"] = dict(zip(("x", "y", "z"), map(float, joints[8])))
        device_used = None
        if self.nvml:
            try:
                device_used = self.nvml[0].nvmlDeviceGetMemoryInfo(self.nvml[1]).used / 1024**2
            except Exception:
                device_used = None
        metrics = {
            "modelMs": elapsed,
            "modelFps": 1000 / statistics.mean(self.samples) if self.samples else None,
            "sampleCount": len(self.samples),
            "warmupRemaining": max(0, 10 - self.frames),
            **self.runtime.memory(),
            "deviceUsedMiB": device_used,
            "frameSize": [width, height],
            "hands": len(hands),
        }
        self.last_metrics = metrics
        return {**result, "metrics": metrics}

    def report(self):
        return {
            **self.status(),
            "processedFrames": self.frames,
            "metrics": self.last_metrics,
            "timingsMs": {
                "samples": len(self.samples),
                "mean": statistics.mean(self.samples) if self.samples else None,
                "median": statistics.median(self.samples) if self.samples else None,
                "p95": float(sorted(self.samples)[int((len(self.samples) - 1) * 0.95)]) if self.samples else None,
            },
            "notes": [
                "模型时间包含检测、姿态和视频细化；不包含浏览器编码、HTTP、面部识别或画面显示。",
                "显存 allocated/reserved/peak 为此 PyTorch 进程；deviceUsed 为整张显卡。",
                "MPS 使用统一内存：allocated 为张量占用，driverAllocated 为本进程 Metal 驱动分配。",
                "MPS sampledPeakAllocated 仅为逐帧采样最大值；CUDA peak 是分配器峰值，两者口径不同。",
                "当前接口不提供 MPS reserved、分配器峰值、整机 GPU 内存及 CPU 内存占用，返回 null。",
                "前 10 帧为预热；统计窗口最多保留最近 120 帧。",
                "三维位置使用估计相机内参，不能作为经标定的物理测距。",
                "指尖抖动与前推准确率需要实际动作或带标注的视频验收。",
                "仅输出关键点；禁用不参与关节点计算的 MANO 稠密表面重建，不等同于完整网格管线。",
            ],
        }


class Handler(SimpleHTTPRequestHandler):
    def json_response(self, value, status=200):
        payload = json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        # A canceled browser request must not turn a successful inference into a model error.
        with suppress(BrokenPipeError, ConnectionResetError):
            self.end_headers()
            self.wfile.write(payload)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/fah/health":
            engine = self.server.engine
            if engine.state == "missing_dependencies":
                with engine.lock:
                    if engine.state == "missing_dependencies" and prerequisites()["ready"]:
                        engine.state = "loading"
                        engine.message = "依赖已就绪，正在加载 FAH-S；稍后重新选择本方案"
                        threading.Thread(target=engine.load, daemon=True).start()
            self.json_response(self.server.engine.status())
        elif path == "/api/fah/report":
            with self.server.engine.lock:
                self.json_response(self.server.engine.report())
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path not in ("/api/fah/frame", "/api/fah/reset"):
            self.json_response({"error": "Not found"}, 404)
            return
        expected = {
            f"http://127.0.0.1:{self.server.server_port}",
            f"http://localhost:{self.server.server_port}",
        }
        if self.headers.get("Origin") and self.headers["Origin"] not in expected:
            self.json_response({"error": "Origin rejected"}, 403)
            return
        client = parse_qs(parsed.query).get("client", [""])[0]
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.json_response({"error": "Invalid payload length"}, 400)
            return
        if not client or len(client) > 100 or not 0 <= length <= 2 * 1024 * 1024:
            self.json_response({"error": "Invalid client or payload length"}, 400)
            return
        engine = self.server.engine
        payload = self.rfile.read(length)
        if engine.state != "ready":
            self.json_response({"error": engine.message, "state": engine.state}, 503)
            return
        with engine.lock:
            try:
                if parsed.path == "/api/fah/reset":
                    engine.reset(client)
                    self.json_response({"ok": True})
                else:
                    self.json_response(engine.infer(payload, client))
            except ValueError as error:
                self.json_response({"error": str(error)}, 400)
            except Exception as error:
                engine.state = "error"
                engine.message = str(error)
                traceback.print_exc()
                self.json_response({"error": str(error)}, 500)

    def log_message(self, message, *args):
        if "/api/fah/frame" not in str(args[0] if args else ""):
            super().log_message(message, *args)


def main():
    os.chdir(ROOT)
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--device", choices=("auto", "cuda", "mps", "cpu"), default="auto")
    args = parser.parse_args()
    engine = Engine(args.device)
    server = ThreadingHTTPServer(
        ("127.0.0.1", args.port), partial(Handler, directory=str(ROOT / "app"))
    )
    server.engine = engine
    threading.Thread(target=engine.load, daemon=True).start()
    print(f"FAH preview: http://127.0.0.1:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
