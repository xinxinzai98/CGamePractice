# 实验蜂部署记录

公网入口：http://8.130.114.41/dawn/

2026-09-11 部署到已有 SSH 别名 codex-shiyanfeng，经当前 SSH 配置及实际登录核实主机。使用本机当前工作树构建（包括未提交 EVA、视觉与图标改动），没有上传本机账号、数据库或开发依赖。

## 运行位置

- 发布版本：20260911T092458Z
- 当前链接：/opt/dawn-game/current
- 不可变发布目录：/opt/dawn-game/releases/20260911T092458Z
- 清单：发布目录中的 release-manifest.json，117 个文件 SHA-256 校验通过。
- 发布包 SHA-256：fd4c70bc6a35150bc71de28755f87f43ff0adfdabd085c3c5e5ad264777495c3
- systemd：/etc/systemd/system/dawn-game.service，开机启动、失败重启，DynamicUser 隔离运行。
- Node：复用主机 /usr/bin/node v24.14.1；仅上传生产依赖 ws。
- 内部监听：127.0.0.1:8178；Nginx 剥离 /dawn/ 后转发，包含 WebSocket Upgrade，并把游戏 Cookie 路径限制到 /dawn/。
- 存档：/var/lib/dawn-game/profiles.sqlite（systemd StateDirectory，真实目录 /var/lib/private/dawn-game）。目录 0700、文件 0600，更新发布目录不会替换数据。
- Nginx 路由：/etc/nginx/snippets/dawn-game.conf，现有 shengyan-site 添加独立 include，根站点仍转发原 3000 服务。
- Nginx 原配置备份：/opt/dawn-game/backups/shengyan-site.before-dawn-20260911T092458Z。
- 内存限制：MemoryHigh 192M / MemoryMax 256M，Node heap 128M；测试期间进程没有重启。

## 验证

本地完整回归 250 项通过；DAWN_BASE_PATH=/dawn/ 构建成功。公网 /ready 返回 build/storage 均 true；首页、JS、CSS、标题字、图标和 EVA 精灵均 200 且 MIME 正确。未登录 WebSocket 返回 401，登录后的双客户端 WebSocket Upgrade、创建/加入、双方准备、MAGI 开局和状态广播通过。原站点 / 仍返回 200，原站点与 LangBot 未停止。

公网冒烟测试建立两个普通初始 QA 账号：qa_mtwrckb0_a、qa_mtwrckb0_b。密码随机生成且未输出、未保存；测试仅进行 MAGI 演习，不增加正式库存或成长。没有迁移本机试玩账号。实际用户需自行注册。

内置浏览器工具连接公网时两次超时，因此本次公网可视检查未完成；部署验证依据真实 HTTP 请求与经过 Nginx 的两个认证 WebSocket 客户端。此前本地视觉验收见 design-qa.md，不能将它当作公网截图。

当前 HTTP 入口，没有域名或证书。配置 HTTPS 后需启用 DAWN_SECURE_COOKIES=1 并重新启动；代理信任当前仅 127.0.0.1,::1，覆盖 X-Forwarded-For。

## 更新与回退

更新前使用 maintenance.cjs backup 导出一致性快照；构建时使用 DAWN_BASE_PATH=/dawn/，新增 release 目录并校验清单，切换 current 后重启 dawn-game。不要在主机上编译前端，避免与现有服务争抢内存。数据库版本改变时，先执行迁移预览及独立恢复演练。

本次为首次部署。若需撤回入口，恢复上述 Nginx 备份后 nginx -t，再 reload nginx；停止 dawn-game 服务即可。保留发布目录、数据库和备份，不删除数据。后续版本回退必须配套相应版本数据库备份，不直接让旧代码读新 schema。

运行检查：systemctl status dawn-game；journalctl -u dawn-game；curl http://127.0.0.1:8178/ready。

本地发布工具和验证日志在 work/deploy-shiyanfeng/。未新增定时任务。
