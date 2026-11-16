# FAH-S 本机最小验证

现有三个浏览器方案保持可选，默认仍为模型增强版。新增第四项 FAH-S：
手部采用本机 CUDA / MPS FAH-S，面部仍用浏览器 Face Landmarker 表情系数。
画线、前推阈值、灵敏度和擦拭沿用仅修复版，便于先比较手部追踪模型本身。

## 环境与权重

- Python 3.12 独立环境：`.local/fah-venv`。
- PyTorch 2.8.0 + CUDA 12.8、torchvision 0.23.0。
- 上游代码：`noahcao/FAH`，固定提交 `2b13dd9c7fc04ad173a76ab89beac9266d2d59ac`。
- 权重：`noahcao/FAH`，固定 revision `9f8a86f47a83cb23226ae7ab696c0500dabf6c82`。
- 数据目录：`.local/fah-data`。上游检出副本、虚拟环境、权重和完整本地报告不提交到 Git；
  本项目适配代码和交接说明提交到 Git。
- 设置：FAH-S / video / CUDA 或 MPS / mesh=none / tips=false / parts=false / contact=false。
- 未配置 MANO，不运行其网格拟合或依赖 MANO 的指尖轮廓延伸。
  此轮直接比较网络输出的关节点，保留 FAH 模型自带的必要 MHR 依赖。
- 固定上游版本在 `mesh=none` 下仍会通过 `dense_vidx` 调用 MANO
  表面重建。本机适配在加载后将此映射设为 `None`，跳过稀疏表面到完整网格的
  插值；网络权重、21 个关节点预测、相机放置和视频滤波保持原计算流程。
  不导出网格，报告明确标记 `surfaceReconstruction=false`。
- Windows 的 TorchScript 文件加载不支持当前中文绝对路径；服务启动时固定工作目录，
  模型文件使用相对于项目根目录的 ASCII 路径，上游代码保持原样。

### Windows NVIDIA（已实机验证）

首次安装推荐 Python 3.12 解释器：

```powershell
.\tools\fah\setup.ps1 -Python "C:\path\to\python.exe" -ConfigSource maccap
```

SAM 3D Body 的 `model_config.yaml` 可从官方授权仓库或指定的 MacCap 镜像获取。
本次本机验证使用用户选定的 MacCap 镜像，固定提交
`c7d269157b6b04a5be33b68d1b0e622c62de238b`，配置 SHA-256 为
`1012fc3f39cb5e90e3f8fbadf7bded31604bfafdce0321d17a7c1a2d3f08b88d`。
该文件内容标识与官方公开文件元数据一致。下载时同时保存 SAM、DINOv3
许可证和 `source.json` 来源记录；镜像不改变原有许可证条件。

```powershell
.\.local\fah-venv\Scripts\python.exe .\tools\fah\prepare.py --config-source maccap
```

也可在 `https://huggingface.co/facebook/sam-3d-body-dinov3` 获得访问权限后，
使用独立环境的 CLI 在本机登录；令牌只在本机交互输入，不写进源码：

```powershell
.\.local\fah-venv\Scripts\hf.exe auth login
.\.local\fah-venv\Scripts\python.exe .\tools\fah\prepare.py
```

下载完成后，重新选择 FAH 方案会触发服务加载；启动摄像头时会等待加载，最长 90 秒。
`prepare.py --public-only` 只下载公开依赖；`prepare.py --check` 检查缺失文件。
公开模型文件验证固定 SHA-256。MHR 来自 Meta 官方发布并核对 SHA-256。
配置必须通过固定 SHA-256 校验，不使用修改后的配置冒充原版。
FAH 与上游组件的许可见 `.local/FAH/WEIGHTS_LICENSE` 和第三方许可说明。
FAH 权重条款限定研究和非商业使用；公开下载和镜像校验不改变这些条款。

### Mac Apple Silicon（启动支持已实现，实机推理待验收）

先用 `python3 tools/start.py` 跑通前三种浏览器方案，再安装本地 FAH。
要求原生 arm64 终端、Git、Python 3.10～3.12（推荐 3.12）以及支持
PyTorch 2.8 MPS 的 macOS；不要通过 Rosetta 运行，也不要复制 Windows 虚拟环境。
如果没有 Python，可自行安装原生 Python 3.12；脚本不会安装系统软件。

```bash
bash tools/fah/setup.sh --python python3.12 --config-source maccap
bash tools/fah/start.sh
```

安装脚本固定上游提交和 PyTorch/torchvision 版本，验证 MPS 矩阵运算，
随后下载并校验同一套模型。不安装 NVIDIA 包，不开启全局 MPS→CPU 算子回退。
MPS 矩阵检查只证明基本计算可用，不代表 FAH 推理已通过。
既有 `.local/FAH` 若提交不同，脚本保留目录并报错，不自动重置同事的改动。
下载失败可重新执行同一命令；哈希不匹配时保留 `.part` 便于检查。

服务使用上游原生 MPS 设置：姿态网络 float32，视频细化由上游安排在 CPU。
当前没有启用 Core ML，也没有声称 M4 MacBook Air 的帧率或内存已经达标。
Intel Mac 可使用浏览器方案；本脚本不将 Intel Mac 当作 Apple Silicon 支持。

设备选择可以显式指定：

```bash
.local/fah-venv/bin/python tools/fah/server.py --device mps --port 8766
```

`--device auto` 依次选择 CUDA、MPS；没有可用 GPU 时明确报错。
`--device cpu` 只用于主动选择的诊断，不会被当作实时 GPU 验证。
Mac 启动脚本默认 MPS，Windows 启动脚本默认 CUDA。
Mac 的安装、模型加载、摄像头和持续运行测试必须由接收同事在实机完成，
验收清单见 [交接说明](../../docs/MAC_HANDOFF.md)。

## 运行

```powershell
.\tools\fah\start.ps1
```

打开 `http://127.0.0.1:8766/`，选择「FAH-S · 本机实验（CUDA / MPS）」，开启摄像头与调试模式。
原有 `http://127.0.0.1:8765/` 静态服务可继续使用前三种方案。
服务只绑定本机回环地址。浏览器 JPEG 帧只发给本机，默认不保存摄像头图片或视频。
初始化失败或缺少授权时显示具体状态，不切换成其他模型伪装成功。

## 测量口径

- 前 10 帧预热；模型计时前后同步所选 CUDA 或 MPS 设备。
- 模型 FPS：最近最多 120 个有效计时的平均耗时倒数，包含检测、姿态和视频细化。
  不包含浏览器 JPEG 编码、HTTP、面部识别或画面显示。
- 有效追踪 FPS：浏览器最近最多 60 个未过期识别结果的时间跨度计算，
  包含采集、编码、传输和面部识别对结果更新频率的影响。保留原来的 42ms 推理调度间隔，
  因此此指标的上限约为 24 FPS；不能把它当作 FAH 的纯模型吞吐上限。
- 进程显存：PyTorch allocated、reserved 和 peak allocated 分开报告。
  整卡占用来自 NVML，包含 Chrome 和其他 GPU 程序；NVML 不可用时返回 null。
- Mac MPS 为统一内存：`allocatedMiB` 为张量占用，`driverAllocatedMiB` 为
  本进程 Metal 驱动分配，`sampledPeakAllocatedMiB` 为每帧结束时的采样最大值，
  无法反映帧内瞬时峰值。`reservedMiB`、`peakAllocatedMiB`、`deviceUsedMiB`
  返回 null，界面不把缺失值显示成 0，不与 CUDA 峰值或整卡显存混用。
- 显式 CPU 模式不采集内存，这些内存字段均为 null；计时仍为实际同步调用的墙钟时间。
- `/api/fah/health`：依赖和模型状态；`/api/fah/report`：本次性能报告 JSON。
  没有真实推理时报告为零帧、空指标，不展示预估值。
- 输入沿用镜面统一采样画布（当前 480×320），保证切换方案时相同取景；
  FAH 检测器内部尺寸为 640，手部网络使用官方 FAH-S 输入设置。
- FAH `joints2d` 用于镜面位置，`joints3d` 用于手形规则。
  传给旧前推规则的 z 以估计焦距和腕部深度转换为等效像素尺度，再以腕部归零；
  仍使用原来的指尖相对深度与手掌放大两路信号，默认阈值不变。
- 调试中的 FAH 指尖 Z 为估计相机坐标，未经相机标定，不等于可靠的物理测距。

## 人工验收

同一光线、摄像头、取景和 1× 灵敏度下逐个切换，至少观察：

1. 食指保持静止 10 秒，观察黄圈是否抖动、是否误按下。
2. 食指前推和回撤各 10 次，记录漏触发、误触发和抬起延迟。
3. 缓慢画线、快速转向，再遮挡食指尖或让手离开画面，观察是否断线或误续画。
4. 连续运行 60 秒，观察有效 FPS、模型 FPS 和显存峰值，区分预热与稳定阶段。

性能报告不包含人工动作真值，不能据此宣称指尖误差或前推准确率。
浏览器验收需保持窗口在前台；后台或被遮挡时的浏览器节流不用于评估模型吞吐。

## 可重复的离线性能测试

使用上游演示视频的左上角 Input 区域作为输入，裁掉其余预测可视化面板，
缩放到与应用相同的 480×320，JPEG 质量 90。通过真实本机 HTTP 接口调用服务，
不会模拟手部结果。视频片段没有指尖或前推动作真值，不用于计算准确率。
输入尺寸变换只用于性能测试，不能把原视频画面与变换后的坐标直接比较。

```powershell
.\.local\fah-venv\Scripts\python.exe .\tools\fah\benchmark.py `
  --video .local\FAH\docs\assets\videos\test_video_selfie.mp4 `
  --crop 0 0 640 426 --start-seconds 10 --frames 130 `
  --report .local\fah-data\benchmark-selfie.json
```

第一视角视频使用 `test_video_ego.mp4`、`--crop 0 0 640 346`。
Mac 上使用相同命令参数，将解释器改为 `.local/fah-venv/bin/python`，路径使用 `/`，
或直接复制 [交接文档中的 Mac 测试命令](../../docs/MAC_HANDOFF.md)。
每次测试生成独立 client，排除前 10 帧，保存全部模型计时和显存采样。
`modelFps` 为排除预热后的平均模型耗时倒数；
`deliveredFpsIncludingPacingAndWarmup` 包含视频读取、编码、HTTP 和输入节奏等待，
不是浏览器摄像头的有效追踪 FPS。测试结束会清除该 client 的时序追踪状态。

## 2026-11-16 本机实测

RTX 4060 Laptop 8GB，PyTorch 2.8.0+cu128，480×320 输入。
以下均为真实 FAH-S 推理，前三项通过本机 HTTP 接口，模型计时同步 CUDA。

| 场景 | 排除预热后的帧数 | 平均模型耗时 | 平均模型耗时倒数 |
| --- | ---: | ---: | ---: |
| 正面示例短片 | 120 | 24.36 ms | 41.05 FPS |
| 第一视角示例短片 | 120 | 20.15 ms | 49.63 FPS |
| 正面连续片段，运行 46.23 秒 | 1190 | 19.32 ms | 51.76 FPS |

连续片段 PyTorch 已分配显存约 2796 MiB，保留约 3448 MiB；
三次离线测试中最大分配峰值约 2981 MiB。连续片段未出现持续的
PyTorch 已分配显存增长；不同手部数量和 CUDA graph 预热会影响速度与缓存。

另外在前台浏览器实拍采集 15 秒读数：摄像头 1280×720，推理采样 480×320，
含手读数的有效追踪为 18.5～20 FPS，平均显示值为 19.4 FPS。
观察到张手、挥擦和手印状态，四种方案切换后均为 Camera ready。
整卡显存读数约 6051～6400 MiB，包含浏览器和其他程序。
前推/抬起成功率、指尖误差和误触发尚无人工标注，需用户同条件对比。

完整记录位于 `.local/fah-data/validation-report.json`；
逐帧离线数据位于同目录的 `benchmark-selfie.json`、`benchmark-ego.json`
和 `benchmark-selfie-sustained.json`。实拍验证仅记录指标与动作状态，不保存摄像头画面。

## 上游依据

- [固定版本的 FAH API 与设备设置](https://github.com/noahcao/FAH/blob/2b13dd9c7fc04ad173a76ab89beac9266d2d59ac/fah/api.py)
- [PyTorch 2.8 MPS 设备检查](https://docs.pytorch.org/docs/2.8/notes/mps.html)
- [PyTorch 2.8 MPS 同步及内存指标](https://docs.pytorch.org/docs/2.8/mps.html)
