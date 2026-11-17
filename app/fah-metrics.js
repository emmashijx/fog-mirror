export function formatFahMemory(metrics) {
  const format = value => Number.isFinite(value) ? Math.round(value) + ' MiB' : '—';
  const allocated = 'PyTorch 分配 ' + format(metrics.allocatedMiB);
  if (metrics.memoryBackend === 'mps') {
    return 'MPS 统一内存 · ' + allocated + ' · Metal 驱动 ' +
      format(metrics.driverAllocatedMiB) + ' · 帧采样分配最大值 ' +
      format(metrics.sampledPeakAllocatedMiB);
  }
  if (metrics.memoryBackend === 'cpu') return 'CPU · 内存指标未采集';
  return 'CUDA · ' + allocated + '（保留 ' + format(metrics.reservedMiB) +
    '，分配峰值 ' + format(metrics.peakAllocatedMiB) + '） · 整卡占用 ' +
    format(metrics.deviceUsedMiB);
}
