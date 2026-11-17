# Fog Mirror 开发交接：Mac

交接日期：2026-11-16。开发分支：`codex/dev-20261116`。
该分支包含此前的交互修复、三种浏览器识别方案、调试和灵敏度、
Windows FAH-S 最小验证，以及本次 Mac 启动和 MPS 适配。
以 `git log -1 --oneline` 记录实际接收提交；没有合并到 main。

## 先获得代码并启动

接收同事需要有仓库读取权限；后续推送还需要写入权限。

```bash
git clone --branch codex/dev-20261116 https://github.com/emmashijx/fog-mirror.git
cd fog-mirror
git status --short
git log -1 --oneline
python3 tools/start.py
```

Chrome 打开 `http://127.0.0.1:8765/`，允许摄像头，先用默认的「模型增强版」。
这是静态 HTML/JS/Canvas 应用，没有 Node/npm 构建依赖；
浏览器 MediaPipe 运行时和模型已随仓库提供。
Python 只负责本地 HTTP 服务，不参与前三种方案的识别。
也可以使用 `python3 -m http.server 8765 --bind 127.0.0.1 --directory app`。
停止服务用 Ctrl+C，换端口用 `python3 tools/start.py --port 8768`。

macOS 如果没有画面，先检查系统设置中 Chrome 的摄像头权限、
浏览器站点权限，以及摄像头是否被其他程序占用。
浏览器方案不依赖 Hugging Face 登录、本地 FAH 环境或 NVIDIA。

## 代码结构

| 路径 | 职责 |
| --- | --- |
| `app/index.html`、`style.css` | 界面、方案选择、调试与灵敏度控制 |
| `app/app.js` | 摄像头、推理调度、识别结果生命周期与镜面交互 |
| `app/vision.js`、`tracker.js`、`tracking-worker.js` | MediaPipe 模型创建、后台推理及资源清理 |
| `app/recognition.js` | 统一的识别方案和交互适配 |
| `app/gestures.js` | 修复后的手势、张嘴与表情规则 |
| `app/legacy-gestures.js` | 冻结的原始交互基线；后续开发保留 |
| `app/index-pressure.js` | 前推信号、校准、按下/抬起阈值及灵敏度 |
| `app/mirror.js` | 雾层、画线、手印、挥擦和雾气衰减 |
| `app/debug-overlay.js` | 独立调试画布、关键点、指尖和前推状态 |
| `app/recording.js` | JPG 和静音 MP4 导出 |
| `app/fah-tracker.js`、`fah-metrics.js` | 本机手部 API、浏览器人脸结果合并及设备内存展示 |
| `app/vendor/` | 已固定版本的浏览器运行时与模型 |
| `tools/start.py` | 仅标准库的跨平台静态预览入口 |
| `tools/fah/` | 本机 FAH 安装、模型校验、推理服务、离线测试和测量说明 |
| `.local/` | 被 Git 忽略的虚拟环境、上游检出、模型、完整报告 |

## 必须保留的对比方案

| 方案 | 手部 | 人脸/起雾 |
| --- | --- | --- |
| 模型增强版（默认） | Gesture Recognizer，未知/低置信度时明确标记规则辅助 | Face Landmarker 表情系数和几何确认 |
| 仅修复版 | Hand Landmarker + 修复后的几何规则 | 嘴部几何规则 |
| 原版基线 | 原始 Hand Landmarker + 冻结交互基线 | 原始嘴部与起雾行为 |
| FAH-S 本机实验 | 本机 FAH-S 21 个关节点 + 当前画线规则 | 浏览器 Face Landmarker 表情系数 |

现有修复包括丢手立即断笔、张手靠近时固定校准基线、更严格的手印条件、
按时间积分的起雾，以及超过 320 ms 的结果不驱动交互。
调试显示 21 个编号关键点、食指 #8、实际绘画点、动作、前推信号和阈值，
独立于导出画布，不应出现在 JPG/MP4。

前推灵敏度 0.5×～2×，默认 1×；按下阈值 `0.145 / sensitivity`，
抬起阈值 `0.070 / sensitivity`，先校准 100 ms，再连续两帧确认。
按下后锁定触发信号源，直到抬起；这些是归一化信号，并非厘米。
调整灵敏度只结束当前笔画并重新校准，不清除雾气或重启摄像头。
原版基线在 1× 保留原来的基线适应行为，比较原始效果使用 1×。

切换方案保留摄像头，停止录制、取消待拍照、清雾并重置校准；
只有当前方案对应的模型运行。不要把加载失败变成静默模型回退。

## Mac 上启动 FAH-S

浏览器开发可以立即开始；本机 FAH 路径针对 Apple Silicon（包括 M4），
Intel Mac 不在此 MPS 安装脚本支持范围内。
准备原生 arm64 Python 3.12、Git 和满足 PyTorch 2.8 MPS 要求的 macOS。
终端 `uname -m` 和 Python 的 `platform.machine()` 应为 `arm64`。

```bash
python3.12 --version
bash tools/fah/setup.sh --python python3.12 --config-source maccap
bash tools/fah/start.sh
```

打开 `http://127.0.0.1:8766/api/fah/health`，等待 `state=ready`，
确认 `hardware.device=mps`、`prerequisites.config_verified=true`，
再打开 `http://127.0.0.1:8766/` 选择 FAH-S 并启用摄像头。
该入口也能运行前三种浏览器方案。
脚本检查 MPS 基本计算；该检查不是 FAH 模型验收或性能测试。

服务只监听 127.0.0.1，JPEG 只传本机且默认不落盘。
不需要把 Windows 服务暴露到局域网，也不复制浏览器登录状态或令牌。
没有可用 MPS 时明确报错；不要用 CPU 跑出的结果声称 MPS 成功。
显式 CPU 诊断可以运行：

```bash
.local/fah-venv/bin/python tools/fah/server.py --device cpu --port 8767
```

服务适配了设备选择、计时同步、内存字段和前端展示；
MPS 沿用固定上游的 float32 姿态网络及 CPU 视频细化设置。
Core ML 尚未接入本项目启动流程，后续如需要再导出、校验和实测。

## 模型、复现与许可

不要提交或复制 `.local/fah-venv`；在目标 Mac 上重建。
不需要完整 SAM `model.ckpt`，也不要求提供个人 Hugging Face 令牌。
本轮配置来源采用已选定的 MacCap 镜像，下载脚本保存许可证和来源清单。

| 组件 | 固定版本/标识 |
| --- | --- |
| FAH 代码 | `noahcao/FAH`，`2b13dd9c7fc04ad173a76ab89beac9266d2d59ac` |
| FAH 权重 | `noahcao/FAH`，`9f8a86f47a83cb23226ae7ab696c0500dabf6c82` |
| SAM 配置镜像 | `cristianAdi13/maccap-model`，`c7d269157b6b04a5be33b68d1b0e622c62de238b` |
| SAM 配置 SHA-256 | `1012fc3f39cb5e90e3f8fbadf7bded31604bfafdce0321d17a7c1a2d3f08b88d` |
| MHR | Meta 官方 MHR v1.0.1；模型 SHA-256 见 `tools/fah/prepare.py` |
| Python/PyTorch | 推荐 Python 3.12；torch 2.8.0、torchvision 0.23.0；Windows 使用 cu128 |

网络权重和检测器、视频细化模型的 SHA-256 固定在 `prepare.py`；
下载后校验。`prepare.py --check` 检查必需文件及配置哈希，
并不重算所有大权重哈希；重跑 `prepare.py --config-source maccap` 会逐项核验。
来源记录在 `.local/fah-data/sam-3d-body-dinov3/source.json`，
SAM/DINOv3 许可证在同目录 `licenses/`。
FAH 代码许可和权重许可不同；权重的研究/非商业限制及第三方条款
见 `.local/FAH/WEIGHTS_LICENSE`、`THIRD_PARTY_NOTICES.md`。
复制、导出或未来商用前应保留并核对对应条款。

本轮设置为 video / mesh=none / tips=false / parts=false / contact=false。
因固定上游在此模式下仍尝试重建 MANO 表面，适配层禁用了
`keypoint_head.dense_vidx` 对应的表面插值。21 个直接预测关节点保留，
报告标记 `surfaceReconstruction=false`，不能把结果称为完整网格管线。
上游检出保持原样，适配集中在本项目服务内。

## Mac 验收与性能记录

当前 Windows CUDA 已完成真实推理和浏览器比较；
Mac 的启动路径及适配代码已准备，**尚无 Mac 实机安装、FAH 推理或性能结果**。
不要把 Windows FPS、MPS 分支隔离检查或矩阵运算当成 Mac FAH 实测。
交接验证结果见 [验证记录](HANDOFF_VALIDATION.md)。

接收同事按顺序完成：

1. 记录 Mac 芯片、内存、macOS、Python/torch 版本和接收提交。
2. 静态入口启动，验证三种浏览器模式、摄像头和切换行为。
3. 安装 FAH，确认健康接口显示真实 MPS 设备和配置校验成功。
4. 进行真实手部推理，观察关节点、按下/抬起、丢手断笔、遮挡后恢复。
5. 各方案在相同光线和距离、1× 灵敏度下比较；前推和回撤各 10 次，
   记录漏触发、误触发和抬起延迟；静止 10 秒观察抖动。
6. 前台连续运行至少 60 秒，记录有效 FPS、同步模型耗时、MPS 张量和驱动分配；
   延长运行观察热降频和内存趋势，不预先承诺 MacBook Air 性能。
7. 验证 JPG/MP4 不带调试叠层，切换方案或停摄像头后无旧骨架/旧笔画。

可重复的公开演示视频测试（先启动 8766 服务，测试时暂停浏览器摄像头，
避免两个 client 交替重置同一个模型的时序状态）：

```bash
.local/fah-venv/bin/python tools/fah/benchmark.py \
  --video .local/FAH/docs/assets/videos/test_video_selfie.mp4 \
  --crop 0 0 640 426 --start-seconds 10 --frames 130 \
  --report .local/fah-data/benchmark-mac-selfie.json
```

连续测试将帧数改为 1200，报告另存 `benchmark-mac-selfie-sustained.json`。
模型计时排除 10 帧预热并同步当前设备；模型 FPS 不含浏览器/HTTP/编码。
应用保留 42 ms 推理间隔，有效结果更新上限约 24 FPS。
MPS 帧采样内存最大值不等同于 CUDA 分配器峰值；缺失字段为 null。
公开视频无动作真值，只能验证性能及输出，不能推导前推准确率。

Windows 历史参考：480×320 输入，正面连续视频模型约 51.76 FPS，
CUDA 分配约 2796 MiB、保留约 3448 MiB；前台实拍含手读数有效追踪
18.5～20 FPS。详见 `tools/fah/README.md`，这些不是 Mac 指标。
完整原始 Windows 报告留在开发机 `.local/fah-data/`，不随 Git 发布；
如需复核，可让交接人另行提供不含摄像头画面的指标文件。

## 常见问题

- 端口占用：换 `--port`，不要盲目结束占用端口的其他程序。
- MPS 不可用：核对原生 arm64 终端/Python、macOS 和 torch 版本；
  不自动打开 `PYTORCH_ENABLE_MPS_FALLBACK` 掩盖不支持的算子。
- macOS 的 urllib 证书错误：修复 Python 的 CA 证书（python.org 安装包附带
  `Install Certificates.command`），不关闭 TLS 校验。
- 下载中断/哈希不符：重跑准备命令，保留报错和来源；不要使用未知权重替换。
- 首次模型加载超过界面等待时间：先查看服务终端和健康接口，ready 后重新选择方案；
  确认是真正慢加载还是失败，不反复重启叠加服务。
- MPS 算子不支持或内存不足：保留完整错误和实际配置，浏览器模式仍可独立开发；
  若需要算子级 CPU 适配，限定范围并在报告中说明。

## 后续开发约束

保留四种方案、默认增强版、原始基线和现有画线规则，先完成 Mac 实机验收，
再基于实际问题修改。修改前检查工作区，不覆盖接收同事未提交的工作。
不要将权重、虚拟环境、访问令牌、摄像头图像或本机完整日志推送到仓库。
变更后的验证范围应包括 Windows CUDA 回归；没有设备时明确说明缺口。
不要直接合并 main，后续提交/推送按协作者约定执行。
可将 [Codex 接手提示词](CODEX_MAC_PROMPT.md) 直接发给同事使用。
