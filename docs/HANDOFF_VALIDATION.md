# 交接验证记录

日期：2026-11-16。执行环境：Windows 11、RTX 4060 Laptop 8GB、
Python 3.12.14、torch 2.8.0+cu128、torchvision 0.23.0。

## 验证范围

本记录区分当前开发机验证与接收 Mac 的实机验收。
Mac 安装脚本、MPS 设备接口和内存口径已实现；
当前没有 Mac 硬件，不能确认 Mac 安装成功、完整 FAH 推理或 M4 性能。
接收同事应按 `MAC_HANDOFF.md` 补充实机结果。

## Windows 历史实测

此前真实 FAH-S video 关节点管线，480×320 输入、CUDA 同步，
排除 10 帧预热：

| 输入 | 有效计时帧 | 平均模型耗时 | 平均耗时倒数 |
| --- | ---: | ---: | ---: |
| 正面公开示例 | 120 | 24.36 ms | 41.05 FPS |
| 第一视角公开示例 | 120 | 20.15 ms | 49.63 FPS |
| 正面连续示例 | 1190 | 19.32 ms | 51.76 FPS |

连续示例 CUDA allocated 约 2796 MiB、reserved 约 3448 MiB，
三项离线测试中 peak allocated 最大约 2981 MiB。
前台摄像头含手读数有效追踪 18.5～20 FPS；不等于纯模型 FPS。
没有指尖误差或前推准确率真值。

完整原始数据留在交接机 `.local/fah-data/validation-report.json`
及 `benchmark-*.json`，不随 Git 传递；历史汇总也见 `tools/fah/README.md`。

## 本轮交接变更验证

以下在当前 Windows 开发机执行；MPS 分支检查使用隔离测试替身，
只用于校验设备调用与字段语义，不代表 Mac 模型实测。

- Python 源码编译、应用 JS 语法检查通过。
- Git Bash 对两个 Mac 脚本语法检查通过；帮助、非法配置、
  非 Mac 环境拒绝和缺少 Mac 虚拟环境的提示符合预期。
- `pip check` 通过；依赖检查 ready，SAM 配置哈希通过；
  Gesture Recognizer 资产哈希符合 README，上游 FAH 检出无修改。
- Runtime 隔离检查通过：auto 优先 CUDA，其次 MPS，无 GPU 时不静默回退；
  MPS 路径不调用 CUDA 同步/内存接口，逐帧采样最大值和重置行为正确；
  显式 CPU 内存字段为 null，离线报告能聚合缺失内存字段。
- 跨平台静态入口返回实际应用页面；文档本地链接检查通过。
- Chrome 实际加载四种方案：前三项运行真实 MediaPipe 模型，
  FAH 项通过真实 HTTP/CUDA 服务；公开演示输入均返回 21 个二维和三维手部点。
  页面四方案选择正常，默认仍为增强版。
- MPS 内存格式化隔离检查通过：显示统一内存/Metal 驱动/帧采样最大值，
  缺失值显示「—」，不显示成 0，不标为 CUDA 整卡显存。
- 冻结原版基线与改前 HEAD（`c588db6`）逐行去除空行和注释后完全一致；
  原文件中的四条解释性注释未复制，逻辑没有改变。
- 从 Git 暂存区导出干净副本，用独立静态入口启动：
  应用模块和三个模型资产均返回 200，Chrome 实际加载三种浏览器模型并推理通过。
  副本不依赖开发机的 `.local`、虚拟环境或临时输入图片，两个 shell 脚本为 LF。

适配后 Windows CUDA 真推理回归：公开正面示例裁出 Input 面板，
480×320、JPEG 90，经本机 HTTP 调用 130 帧，排除 10 帧预热。
120 个计时样本均返回 21 个手部点，平均模型耗时 **25.03 ms / 39.96 FPS**，
p95 32.26 ms；CUDA allocated 最大 2796 MiB、reserved 最大 3448 MiB、
peak allocated 2981 MiB。短测试受初始化缓存和运行环境影响，
不与历史连续测试的 51.76 FPS 当作同条件性能增减比较。
原始报告在 `.local/fah-data/benchmark-handoff-cuda.json`，不随 Git 传递。

本轮未重新进行真人摄像头动作成功率或录制导出验收；
此前四方案摄像头切换已验证，但真实动作准确率仍需要接收同事配合测试。

## Mac 接收验收

尚未执行。需记录 Mac 芯片/内存/macOS、安装依赖、真实 MPS FAH 输出、
前台浏览器四方案行为、至少 60 秒持续性能、内存口径及人工前推对比。
