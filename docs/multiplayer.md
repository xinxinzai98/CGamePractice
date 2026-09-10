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
- SQLite事务提交购买、配置、抽奖与结算；终局与待发奖励持久保存，重试或重启后继续结算，已发奖励不重复发放。
- 如首次发现同目录旧`profiles.json`，会导入并记录迁移标记，保留原文件。
- 会话在内存中；服务重启需要重新登录，玩家档案保留。
- 数据库和档案带版本；升级前保留完整备份，旧SQLite迁移前还会自动生成迁移备份。新的内容版本必须提供装备和技能配置的明确迁移。
- `data/`不能上传到Git。维护命令不会输出密码或密码哈希，生成的数据库备份权限为`0600`。

## 备份、恢复与升级

先构建共享规则，再使用维护工具。所有数据库路径都需明确指定；备份和恢复**拒绝覆盖已有目标文件**。

```sh
npm run build:shared
node server/maintenance.cjs verify --database data/profiles.sqlite
node server/maintenance.cjs backup --database data/profiles.sqlite --output data/backups/pre-upgrade-20260910.sqlite
node server/maintenance.cjs restore --backup data/backups/pre-upgrade-20260910.sqlite --database work/restore-drill/profiles.sqlite
node server/maintenance.cjs verify --database work/restore-drill/profiles.sqlite
```

`backup`和`restore`通过SQLite的参数化`VACUUM INTO`产生一致快照，包括源库WAL中已提交的数据。可在运行期间备份，不要直接复制仍在打开的`.sqlite`文件。工具检查SQLite完整性、外键、游戏表、账号档案关联及JSON格式；它不替代当前版本的启动迁移与登录验证。

恢复演练使用独立目录：启动一份指向演练库的服务，登录核对账号、金币、背包和战绩，再关闭演练服务。需要正式恢复时，先停止游戏服务，额外备份当前库，再将经过验证的恢复库所在目录作为新的持久化目录启动；保留旧目录以便回查。不要把恢复库直接覆盖在打开的数据库或旧WAL旁边。

每次升级先备份并记录对应代码提交，再对独立恢复库运行新版本、验证登录与一场结算，成功后升级正式实例。数据库已经升级时，不要直接降级旧代码读取新库；回退应使用对应旧代码和升级前备份。尚未结算的比赛不跨服务重启继续战斗，已持久化的终局奖励会恢复处理。

建议部署时每天备份并保留最近7份，另保留每次升级前的备份；至少一份复制到服务器以外。定期重复恢复演练，检查备份日期与命令退出码。仓库当前不替用户创建定时任务或执行公网备份。

## 独立测试账号与离线账号恢复

测试账号只能写入明确指定的独立测试库，命令会拒绝默认`data/profiles.sqlite`，也不会覆盖同名账号。下面先从终端无回显读取密码，再通过环境变量传给命令；命令参数和代码中不包含固定密码。

```sh
read -r -s DAWN_TEST_PASSWORD
export DAWN_TEST_PASSWORD
node server/maintenance.cjs seed-test --database work/test-data/profiles.sqlite --username Test_Asuka --pilot Asuka
node server/maintenance.cjs seed-test --database work/test-data/profiles.sqlite --username Test_Rei --pilot Rei
unset DAWN_TEST_PASSWORD
DAWN_PROFILES_FILE=work/test-data/profiles.sqlite PORT=8180 npm start
```

每个测试账号获得2000金币、10张补给券、双角色各2400熟练度及12关解锁；这些是测试资源。指定测试库启动服务后才能登录它们，测试库与默认玩家库互相独立。

管理员恢复密码只在**停止该数据库对应的游戏服务后**执行，先备份，再运行：

```sh
read -r -s DAWN_ADMIN_PASSWORD
export DAWN_ADMIN_PASSWORD
node server/maintenance.cjs reset-password --database data/profiles.sqlite --username player_name --offline
unset DAWN_ADMIN_PASSWORD
```

`--offline`表示操作者已停止服务，不会自动查找或终止服务器。工具通过账号服务重新生成盐和密码哈希，保留角色进度；重启后原有内存会话失效，玩家使用新密码登录。不要向其他人分发恢复后的密码或开放这个离线命令为公网接口。

## 房间协议

服务器以30 Hz模拟，约15 Hz广播；客户端发送输入，不决定坐标、伤害或奖励。

断线保留座位30秒并暂停；页面还开着时自动重连。刷新后重新进入，登录仍有效且服务端还保留席位时会自动恢复战前准备或当前战斗。全队手动暂停，结算成功后房主可返回准备、重开或推进。档案写入失败时暂时禁止推进并重试。

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
docker run -d --name dawn-game --restart unless-stopped -p 127.0.0.1:8178:8178 -v dawn-data:/app/data -e DAWN_SECURE_COOKIES=1 dawn-game
```

公网入口使用HTTPS反向代理，页面自动使用wss；`DAWN_SECURE_COOKIES=1`开启Secure登录Cookie，此时必须从HTTPS入口访问。直接本地HTTP测试时不设置该变量。Docker镜像内置`GET /ready`健康检查：`/health`只证明进程存活，`/ready`还检查客户端构建和数据库是否可读，失败返回503。

代理应保留Host与WebSocket Upgrade，并**覆盖**`X-Forwarded-For`为直接客户端地址，不接受浏览器自己声明的转发链：

```nginx
location / {
    proxy_pass http://127.0.0.1:8178;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_read_timeout 120s;
}
```

`DAWN_TRUST_PROXY`接收以逗号分隔的代理精确IP，只有来自这些地址的连接才采用转发地址进行限流。默认不信任任何代理。例如Node直接在宿主机监听、Nginx从本机连接时可设`DAWN_TRUST_PROXY=127.0.0.1,::1`；Docker场景需要依据实际网络填写Node看到的代理地址，不能照抄本机地址或配置通配信任。该变量与代理覆盖请求头的配置应同时生效。

域名、证书、可信代理IP、持久卷与备份位置在部署阶段按实际服务器确定。游戏服务只向本机或反向代理网络开放，数据库卷随代码更新保留。先部署单实例；内存房间与会话不跨进程共享，不能启动多个实例随机分流，也不需要为当前小规模游戏引入跨服或分布式数据库。
