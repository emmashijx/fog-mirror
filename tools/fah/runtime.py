import platform


class Runtime:
    def __init__(self, torch, requested="auto"):
        self.torch = torch
        cuda_available = torch.cuda.is_available()
        mps_available = torch.backends.mps.is_available()
        self.device = requested
        if requested == "auto":
            self.device = "cuda" if cuda_available else "mps" if mps_available else None
        if self.device is None:
            raise RuntimeError("没有可用的 CUDA/MPS；不会自动回退 CPU。前三种浏览器方案仍可使用。")
        if self.device == "cuda" and not cuda_available:
            raise RuntimeError("CUDA 不可用；请使用 NVIDIA 环境，或在 Apple Silicon 上选择 --device mps。")
        if self.device == "mps" and not mps_available:
            raise RuntimeError("MPS 不可用，当前进程无法使用 Metal GPU。请在 macOS 自带的终端用原生 arm64 Python 启动 FAH-S。")
        if self.device not in ("cuda", "mps", "cpu"):
            raise ValueError("Unknown device: " + str(self.device))
        self.sampled_peak = 0

    def hardware(self):
        return {
            "device": self.device,
            "gpu": self.torch.cuda.get_device_name(0) if self.device == "cuda" else (
                "Apple Metal (MPS)" if self.device == "mps" else None
            ),
            "torch": self.torch.__version__,
            "cuda": self.torch.version.cuda if self.device == "cuda" else None,
            "platform": platform.platform(),
            "machine": platform.machine(),
        }

    def synchronize(self):
        if self.device == "cuda":
            self.torch.cuda.synchronize()
        elif self.device == "mps":
            self.torch.mps.synchronize()

    def reset_peak(self):
        self.sampled_peak = 0
        if self.device == "cuda":
            self.torch.cuda.reset_peak_memory_stats()

    def memory(self):
        result = {
            "memoryBackend": self.device,
            "allocatedMiB": None,
            "reservedMiB": None,
            "peakAllocatedMiB": None,
            "sampledPeakAllocatedMiB": None,
            "driverAllocatedMiB": None,
        }
        if self.device == "cuda":
            result.update(
                allocatedMiB=self.torch.cuda.memory_allocated() / 1024**2,
                reservedMiB=self.torch.cuda.memory_reserved() / 1024**2,
                peakAllocatedMiB=self.torch.cuda.max_memory_allocated() / 1024**2,
            )
        elif self.device == "mps":
            allocated = self.torch.mps.current_allocated_memory() / 1024**2
            self.sampled_peak = max(self.sampled_peak, allocated)
            result.update(
                allocatedMiB=allocated,
                sampledPeakAllocatedMiB=self.sampled_peak,
                driverAllocatedMiB=self.torch.mps.driver_allocated_memory() / 1024**2,
            )
        return result
