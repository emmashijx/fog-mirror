# 可直接发给 Mac 同事的 Codex 提示词

复制下面整段给在 Mac 项目目录中工作的 Codex：

---

请接手 Fog Mirror 项目的 Mac 开发，先完成本机运行和验收，再根据结果继续改进。

仓库：https://github.com/emmashijx/fog-mirror
交接分支：`codex/dev-20261116`。先检查工作区和当前分支，不覆盖本地改动。
如果尚未克隆，克隆这个分支；如果已经有仓库，先检查本地修改再安全同步。
记录 `git log -1 --oneline`，先阅读 `README.md`、`docs/MAC_HANDOFF.md`、
`docs/HANDOFF_VALIDATION.md` 和 `tools/fah/README.md`，不要依赖原聊天记录。

项目是静态 HTML/JS/Canvas，没有 npm 构建步骤。先检查本机芯片、内存、
macOS 和 Python，使用 `python3 tools/start.py` 启动，
用 Chrome 打开 `http://127.0.0.1:8765/`，协助我完成摄像头授权和人工动作测试。
浏览器操作可用时实际验证页面，不只报告服务返回 200。

必须保留四种可切换方案：默认模型增强版（Gesture Recognizer＋人脸表情系数）、
仅修复版、原版基线和 FAH-S 本机实验。保留关键点/指尖/动作调试显示、
前推/按下/抬起阈值、0.5×～2× 灵敏度、拍照录像和既有起雾绘画行为。
不要删除原版 `app/legacy-gestures.js`，不要把识别失败静默替换成其他模型。

若是 Apple Silicon，在原生 arm64 环境用 Python 3.12 执行：

```bash
bash tools/fah/setup.sh --python python3.12 --config-source maccap
bash tools/fah/start.sh
```

打开 `http://127.0.0.1:8766/api/fah/health`，确认 ready、
`hardware.device=mps` 和配置哈希验证成功，再在 8766 页面使用 FAH。
如果不是 Apple Silicon，先跑浏览器方案并说明 FAH MPS 支持范围。

已有 Mac 安装脚本、MPS 设备选择/计时/内存和界面适配，但交接时只有
Windows CUDA 真实推理验证，Mac 上的完整安装、FAH 推理及性能仍需你实机验收。
请继续解决实际遇到的兼容问题，不把模拟检查或 MPS 矩阵运算当成 FAH 验收。
不要自动开全局 CPU fallback；上游安排视频细化在 CPU 是已知设置，
如需新的局部 CPU 适配请说明范围和性能影响。

使用脚本中固定的 FAH 提交、权重 revision 和 MacCap 配置哈希，保留许可证和
来源记录，不升级依赖或替换模型来掩盖问题，不复制 Windows 虚拟环境。
不需要完整 SAM checkpoint；当前是关节点最小管线，禁用了 MANO 表面插值，
保持 `surfaceReconstruction=false`，不要称为完整网格推理。
Core ML 尚未接入，先跑通 MPS；有实测依据再讨论 Core ML。

按交接文档用公开演示视频做真实离线测试，再前台摄像头至少运行 60 秒。
记录输入尺寸、设备/依赖版本、预热帧、同步模型 FPS、有效追踪 FPS、
MPS 张量占用/Metal 驱动分配/逐帧采样最大值。MPS 统一内存、采样最大值
和 Windows CUDA 峰值的口径不同，不可混称独立显存或精确峰值。
离线测试时暂停浏览器摄像头，避免两个 client 反复重置视频状态。

四种方案用相同距离、光线和 1× 灵敏度比较：静止指尖 10 秒，
前推/回撤各 10 次、慢画/快转、遮挡、丢手再入画、张手手印和靠近挥擦。
记录误触发/漏触发及抬起延迟，需要真人动作时明确提示我配合。
验证调试叠层不出现在 JPG/MP4，切换方案/停摄像头后没有旧骨架或续画。
没有标注数据时不要宣称准确率提升。

变更集中在必要兼容修复，保留已有功能和 Windows CUDA 路径。
完成后给出修改说明、实际测试结果、未通过项和下一步建议，
更新交接验证记录。环境、模型和完整日志放 `.local/`，不要提交凭据、
摄像头素材或大模型。后续 Git 提交/推送遵循我明确给出的要求，不直接合并 main。

---
