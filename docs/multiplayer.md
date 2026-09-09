# 联网、个人存档与部署

## 本地运行

```sh
npm ci --ignore-scripts
npm run build
npm start
```

默认 `http://127.0.0.1:8178`，使用构建后的Phaser客户端。封面进入登录/注册；创建小队后选择战役、小关卡、难度、角色和配置。两位玩家都准备后开局，各自在自己电脑上用方向键移动。

公开大厅会列出可加入的等待小队；也可分享六位房间码。单个房间是双人合作，不限于特定账号。

## 数据

- 默认 `data/profiles.sqlite`，包括账号、角色熟练度、技能树、金币、配件、免费补给及战绩。
- SQLite事务提交购买、配置、抽奖与结算，奖励账本保证重试与重启后不重复发放。
- 如首次发现同目录旧`profiles.json`，会导入并记录迁移标记，保留原文件。
- 会话在内存中；服务重启需要重新登录，玩家档案保留。
- `data/`不能上传到Git；备份时应按SQLite WAL规则操作，推荐停止服务后复制整个数据目录。

## 房间协议

服务器以30 Hz模拟，约15 Hz广播；客户端发送输入，不决定坐标、伤害或奖励。

断线保留座位30秒并暂停；页面还开着时自动重连。刷新页面不会保留临时座位令牌，需重新组队。全队手动暂停，结算成功后房主可返回准备、重开或推进。档案写入失败时暂时禁止推进并重试。

## 局域网

```sh
HOST=0.0.0.0 PORT=8178 npm start
```

朋友访问主机局域网IP的8178端口。`127.0.0.1`仅指各自电脑，不是可分享的公网地址。网络与防火墙需允许连接。

## 以后部署到服务器

当前未执行公网部署。需要支持长期运行Node.js的服务器；静态GitHub Pages不能运行房间服务。

仓库提供多阶段Dockerfile，构建客户端和共享规则后仅运行服务器。示例：

```sh
docker build -t dawn-game .
docker run --rm -p 127.0.0.1:8178:8178 -v dawn-data:/app/data dawn-game
```

在已有HTTPS反向代理中转发站点和`/ws`，保留Host与WebSocket Upgrade；页面自动使用wss。健康检查`GET /health`。

```nginx
location / {
    proxy_pass http://127.0.0.1:8178;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
}
```

域名、证书、持久卷、备份与正式环境参数在部署阶段按实际服务器确定。当前房间内存不跨进程共享，先部署单实例；没有跨服匹配或大规模MMO世界。
