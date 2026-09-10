# Docker 部署与存档维护

使用现有多阶段 Dockerfile 构建前端和共享规则，运行容器只保留服务器、生产依赖和客户端产物。Compose 负责启动、重启、端口、日志与玩家数据卷，无需在服务器单独安装 Node.js。

当前设计是一个游戏服务实例和一个 SQLite 数据卷。增加容器副本不会自动获得跨进程房间同步，所以保持单实例。

## 启动

需要 Docker Engine、Compose 和 Buildx 插件。可先用 `docker info`、`docker compose version`、`docker buildx version` 确认安装完整。仓库没有打包任何玩家账号或数据库；首次启动得到空玩家库，可以正常注册。

```sh
docker compose up -d --build --wait
docker compose ps
docker compose logs --tail=100 game
```

默认访问 `http://127.0.0.1:8178`。若本机的 Node 试玩版已经占用 8178，可让容器使用独立端口，存档也彼此独立：

```sh
DAWN_HTTP_PORT=8188 docker compose up -d --build --wait
```

需要固定自定义参数时，将 `.env.example` 复制为 `.env` 后编辑。`.env` 不进入 Git 或镜像；前端没有独立的服务地址配置，同一个入口转发网页、`/api` 和 `/ws`。

`compose.yaml` 的项目名默认为 `dawn-game`，数据卷为该项目的 `game-data`。更新代码或移动仓库后继续使用相同项目名；测试可用 `docker compose -p dawn-test ...` 创建独立项目与数据卷。

## 存档、备份与导出

镜像以 `node` 用户运行。数据卷挂载到 `/app/data`，包含数据库、WAL、迁移备份和手动备份；容器其余文件系统只读，临时演练目录使用 `/tmp`。命名卷继承镜像中数据目录的初始权限，避免直接绑定宿主机目录时的 UID 不匹配。

先生成一致备份，再复制到宿主机。备份名需唯一，工具拒绝覆盖已有文件：

```sh
docker compose exec -T game node server/maintenance.cjs backup \
  --database /app/data/profiles.sqlite \
  --output /app/data/backups/pre-update-20260910.sqlite
mkdir -p data/docker-backups
docker compose cp game:/app/data/backups/pre-update-20260910.sqlite data/docker-backups/
```

不要直接复制打开中的 `profiles.sqlite`：事务可能仍在 WAL 中。上面的维护工具使用 SQLite 一致快照，不需要为了备份停止游戏。部署后为导出的备份安排保留策略和异机副本，数据卷本身不能替代备份。

恢复演练写入新目录，不覆盖玩家库：

```sh
docker compose exec -T game node server/maintenance.cjs restore \
  --backup /app/data/backups/pre-update-20260910.sqlite \
  --database /tmp/restore-check/profiles.sqlite
docker compose exec -T game node server/maintenance.cjs verify \
  --database /tmp/restore-check/profiles.sqlite
```

`/tmp` 容量为 64 MiB，适合当前小档案的临时演练。较大档案改用 `/app/data/restore-check/...` 并在验收后清理；不要照搬本地运行手册的 `/app/work/...` 路径。

## 把当前本地存档迁入容器

只在目标卷还没有玩家库时导入，以下命令会拒绝覆盖已有 `profiles.sqlite`。先由现有本地版本导出一致快照：

```sh
node server/maintenance.cjs backup \
  --database data/profiles.sqlite --output data/docker-transfer.sqlite
docker compose build game
docker compose run --rm --no-deps -T game node -e \
  'const fs=require("node:fs");const out=fs.createWriteStream("/app/data/profiles.sqlite",{flags:"wx",mode:0o600});out.on("error",e=>{console.error(e.message);process.exit(1)});process.stdin.pipe(out)' \
  < data/docker-transfer.sqlite
docker compose run --rm --no-deps -T game node server/maintenance.cjs verify \
  --database /app/data/profiles.sqlite
docker compose up -d --wait
```

导入由镜像内的 `node` 用户完成，文件不会变成 root 所有。不要启动两个独立服务写同一份绑定数据库；迁移后以选定的服务作为玩家档案入口。若目标已有档案，应先备份并停止对应服务，恢复到新的独立卷验收后切换，保留旧卷用于回查。

## 更新与停止

更新前生成并导出备份，记录代码提交，然后执行：

```sh
git pull --ff-only
docker compose up -d --build --wait
```

重建容器保留数据卷，升级时服务器会执行版本迁移。更新会中断进行中的房间，需要重新登录和组队；已登记的结算可恢复。数据库升级后，回退需要对应旧代码和升级前备份，不能只切换到旧镜像。

```sh
docker compose stop
docker compose start --wait
```

`docker compose down` 也会保留命名卷。`down --volumes` 会删除卷，不能作为日常更新命令。容器使用 30 秒停止宽限期，让服务器处理退出和数据库关闭；健康状态通过镜像自带 `/ready` 检查。

## 接入域名和 HTTPS

默认只绑定服务器回环地址，让已有反向代理转发到 `127.0.0.1:8178`。将网页、`/api` 和 `/ws` 一并代理，保留 Host 和 WebSocket Upgrade；HTTPS 入口启用 `DAWN_SECURE_COOKIES=1`。

`DAWN_TRUST_PROXY` 填写 Node 在容器内实际看到的代理 IP，不能直接照抄宿主机的 `127.0.0.1`。代理必须覆盖 `X-Forwarded-For`。已有 Nginx 示例和完整配置说明见 [联网运行手册](multiplayer.md)。

Compose 没有自动申请证书或配置用户服务器，也没有公开测试账号。域名与代理按实际部署环境接入。

## 本次验证范围

2026-09-10 已在独立 Colima 环境完成实际构建和运行，使用 Docker Engine 29.5.2、Compose 5.5.0、Node 22.23.2。Linux ARM64 原生执行、Linux AMD64 通过 QEMU 执行，两套镜像均通过以下验证：

- 全新命名卷启动并达到 healthy，网页、图标和战斗素材可访问。
- 注册两个独立账号，保存技能树、外观和装备；两客户端 WebSocket 组队、权威射击和暂停正常。
- 同一抽奖操作重复发送不重复扣券，容器重建后再次核实也返回原奖励。
- `--force-recreate` 确实更换容器 ID，但仍使用原数据卷；重新登录后完整档案逐项一致。
- 容器内在线备份、恢复到独立目录并登录回读成功；正常停止退出码为 0，再启动后档案保留。
- 服务器以 UID 1000 运行，数据库属主相同、权限为 `0600`，容器根文件系统为只读。

另验证了导入空数据卷：与导出的 SQLite 快照字节一致，且再次导入会拒绝覆盖已有库。测试只使用临时账号和数据卷，没有迁移或修改现有 8178 本地玩家档案。容器重建后验收会重新建立 HTTP 连接，并等待宿主机映射端口就绪，避免复用旧连接。

这次验证不包含用户服务器上的域名、HTTPS 代理或公网连通性；这些仍需在实际部署时验收。

参考：[Compose 服务配置](https://docs.docker.com/reference/compose-file/services/)、[数据卷生命周期](https://docs.docker.com/engine/storage/volumes/)。
