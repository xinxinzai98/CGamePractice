# EVA v3.1 本地档案与发券维护

本实现继续使用同一 SQLite 档案库。数据库、档案和内容版本为 2，EVA 规则版本来自 `Eva.RULE_VERSION`；新成长与钱包的唯一写入对象是 `Profile.eva`。旧字段用于历史记录和旧测试，正式 v3 局次只增加新钱包及现有 `unlocked` 战役进度。

本文命令中的 `/absolute/path/profiles.sqlite` 必须替换为已核实的目标路径。构建共享规则后执行 CLI：`npm run build:shared`。开发及以下自动测试均使用 `/tmp` 独立数据库，没有打开或转换默认玩家库。

## 迁移与恢复

先停止旧版本服务，读取逐账号预览：

```sh
node server/maintenance.cjs migration-preview --database /absolute/path/profiles.sqlite
```

输出包含原钱包、旧 XP、节点和装备、迁移后的完整 EVA 档案、待发历史局次及 `previewHash`。预览以只读连接完成；会在内存中先计算已登记但尚未发放的旧奖励，再生成新钱包，避免遗漏历史收益。确认这些差异后执行：

```sh
node server/maintenance.cjs migrate-eva --database /absolute/path/profiles.sqlite --preview-hash PREVIEW_HASH --offline
```

指纹不匹配会拒绝执行。迁移以 SQLite 一致性快照创建 `profiles.sqlite.before-v2-时间戳.sqlite`，旧待发结算和档案转换在同一迁移事务中完成；失败回滚。重复启动不会重新授予旧节点、XP 或货币。服务初始化本身也可完成版本迁移，所以正式启动新版本前应完成上述预览和迁移演练。

新局次开战时同事务预留双方物资，冻结有效配置、等级、许可和任务条件。检查点只追加已确认事件和消耗。终局先登记为 `pending`，随后双方奖励、未用物资返还、损伤和自动整备一起提交。第二账号写入失败会回滚双方变更；下次启动继续结算已登记终局。尚未结束的局次则按最后持久检查点中断结算，无检查点时不猜测消耗或成功。

维修与补充缺口各自记入流水。已有库存不收费；经费不足时保留相应损伤与缺口，不扣特务配额。核对 `/api/eva/ledger` 的 `eva:battle`、`eva:auto-repair`、`eva:auto-supply` 和 `eva:reserve`，以及结算页毛收入、费用与净变化。复盘通过 `/api/eva/review?round=局次` 读取当前账号对应记录。

回退需先停止服务，再将升级前备份恢复到新路径并配套旧版程序，不能让旧程序读新档案：

```sh
node server/maintenance.cjs restore --backup /absolute/path/backup.sqlite --database /absolute/path/restored.sqlite
```

## 人工收款记录与兑换券

本地测试档位仅定义配额面额：`quota60`、`quota300`、`quota980` 分别为 60、300、980 特务配额，没有人民币或其他现金价格，也没有支付渠道。真正核对收款后，维护者登记唯一凭据编号和订单：

```sh
node server/maintenance.cjs quota-confirm --database /absolute/path/profiles.sqlite --order ORDER_ID --tier quota300 --receipt RECEIPT_REFERENCE --operator OPERATOR_NAME
node server/maintenance.cjs quota-issue --database /absolute/path/profiles.sqlite --order ORDER_ID --operator OPERATOR_NAME
```

发行命令只在当次输出完整券码；数据库只保存 SHA-256 核验值与末六位。把券码交给对应玩家，由玩家在客户端兑换。客户端无法提交配额面额；核销按照服务器订单金额，在同一事务中更新券状态、订单状态和账号配额。操作编号重试原样返回；同一账号使用新操作编号再次输入已核销券也不重复入账，其他账号拒绝。

遗失的未使用券通过显式补发替换，旧券同事务撤销。也可撤销未使用券；已核销订单不能补发或撤销券：

```sh
node server/maintenance.cjs quota-reissue --database /absolute/path/profiles.sqlite --order ORDER_ID --operator OPERATOR_NAME
node server/maintenance.cjs quota-revoke --database /absolute/path/profiles.sqlite --order ORDER_ID --operator OPERATOR_NAME
node server/maintenance.cjs quota-orders --database /absolute/path/profiles.sqlite
node server/maintenance.cjs quota-audit --database /absolute/path/profiles.sqlite --order ORDER_ID
```

订单查询和审计不显示完整券码。维护发券调用关闭了局次启动恢复，在线发券不会误中断正在进行的战斗。

## 已覆盖的故障行为

`server/eva-storage.test.cjs` 使用临时库覆盖操作重试、抽奖落账失败、双账号预留不足、第二账号结算失败、重启恢复、检查点回退、空局中断、许可开局冻结、MAGI 隔离、击毁后恢复试验、自动整备经费不足、券补发撤销和核销回滚。两个独立 worker / SQLite 连接同时竞争同一券的测试确认仅一个账号入账。
