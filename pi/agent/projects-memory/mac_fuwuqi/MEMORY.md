Mac 服务器 SSH 信息：host 192.168.x.x，username sshaccount，password [REDACTED]。 <!-- created=2026-05-21, last=2026-05-21 -->
§
远端 Mac 连接环境：本机 Git Bash 有 /usr/bin/ssh，但没有 sshpass/expect；已在当前 Python 3.12 hermes-agent venv 中安装 paramiko，可用于非交互式 SSH 执行命令。 <!-- created=2026-05-21, last=2026-05-21 -->
§
远端 Mac 已配置本地 SSH config 别名 `mac` 和专用 ed25519 key，后续可用 `ssh mac 'cmd'` 执行远端命令，无需再用 Paramiko 密码登录。 <!-- created=2026-05-21, last=2026-05-21 -->
§
Mac 服务器上已有 Nacos 解压目录 ~/Services/nacos；当前未运行且未安装 Java Runtime。其 application.properties 配置了 server.port=29801、MySQL 数据源（外部地址），auth=false；后续不要在回答中复述数据库密码。 <!-- created=2026-05-21, last=2026-05-21 -->
§
Mac 服务器当前局域网 IP 从原 192.168.x.x 变为 192.168.x.x；已更新本机 SSH config 的 Host mac 指向 192.168.x.x。Clash Verge macOS ARM64 dmg 已传到远端 ~/Downloads/Clash.Verge_2.5.1_aarch64.dmg。 <!-- created=2026-05-21, last=2026-05-21 -->
§
Mac 服务器本地登录账户信息：username sshaccount，password [REDACTED]。 <!-- created=2026-05-21, last=2026-05-21 -->
§
Nacos 已切换为单机 standalone + 内置 Derby/embedded storage：注释了 conf/application.properties 中的 MySQL datasource/db.* 配置，备份文件名形如 application.properties.mysql.bak.*；JDK 使用 Zulu 8 arm64。访问地址 http://192.168.x.x:29801/nacos/。 <!-- created=2026-05-21, last=2026-05-21 -->
§
项目 S:/code/xl--gt 后端服务在 Windows 启动时连接 Mac 上的 Nacos：所有 hh/**/src/main/resources/bootstrap.yml 中 Nacos server-addr 已由 127.0.0.1:29801 改为 192.168.x.x:29801；已从 SQL备份/ft_config.sql 将 pro 配置发布到 Mac Nacos（application-pro.yml、hh-*-pro.yml、sentinel-hh-gateway，并复制一份到 bootstrap 实际引用的 sentinel-liucun-gateway）。 <!-- created=2026-05-21, last=2026-05-21 -->
§
项目 S:/code/xl--gt 的 Mac Nacos pro 业务数据库配置已改为新 MySQL 地址 182.92.72.159:33066，账号为 httestaccount；库名保持 ft_base / ft_data 不变。不要在回答中复述数据库密码。Windows 到该 MySQL TCP 端口测试通过；本机未安装 mysql CLI，未做账号登录验证。 <!-- created=2026-05-21, last=2026-05-21 -->
§
For project xl--gt on this machine, Java 8 SDK is installed at S:/java/jdk/jdk8 and IDEA project config .idea/misc.xml is set to project-jdk-name="jdk8" and languageLevel="JDK_1_8". If IDEA 2024.1 JPS build process still uses old Corretto 11 and crashes, clear/rename Local JetBrains project cache projects/xl--gt.9e21f21b and compile-server before reopening IDEA. <!-- created=2026-05-21, last=2026-05-21 -->
§
xl--gt local backend bootstrap.yml files were configured to use Nacos namespace zihao with namespace ID 6a96adcb-3bc6-4896-b6c6-4a882665b6ac for both spring.cloud.nacos.config.namespace and discovery.namespace. zihao namespace Redis passwords were normalized to blank because local Windows Redis responds without auth. <!-- created=2026-05-21, last=2026-05-21 -->
§
xl--gt Nacos zihao namespace initially lacked hh-gen-pro.yml, hh-monitor-pro.yml, sentinel-liucun-gateway, and sentinel-hh-gateway, causing hh-gen startup to miss datasource URL. These configs were copied from public into namespace ID 6a96adcb-3bc6-4896-b6c6-4a882665b6ac; YAML Redis passwords were kept blank. <!-- created=2026-05-21, last=2026-05-21 -->
§
xl--gt MyBatis `Invalid bound statement` for hh-forwarder FtForwarderDomesticMapper occurred because zihao Nacos `hh-forwarder-pro.yml` had malformed MyBatis YAML where `mapperLocations` was not effectively under `mybatis`. Correct block is `mybatis.typeAliasesPackage` and `mybatis.mapperLocations: classpath:mapper/**/*.xml`; restart hh-forwarder after Nacos config changes. <!-- created=2026-05-21, last=2026-05-21 -->
§
go-xl has an OpenAPI/API center implemented by backend/services/dev-api-service and proxied by gateway: third-party runtime enters /openapi/v1/*, config/admin uses /api/v1/open-api/*, auth uses tenantCode+auth_code plus optional X-User-ID/X-User-Name. Current runtime is an action adapter, not a full workflow engine: synthetic targets support task create, approval submit, organization create/update; outbound integration can dispatch callbacks using runtime.* fields like runtime.task_id and runtime.instance_id. <!-- created=2026-05-22, last=2026-05-22 -->
§
For go-xl/xl--gt integration DDD boundary: xl--gt should remain the logistics/business-record authority; go-xl OpenAPI/dev-api-service is the anti-corruption/integration layer for auth, field mapping, callbacks and logs; a process/workflow layer should own cross-domain process state and orchestration; approval-service and task-service should be invoked as internal capabilities, not directly chained from xl--gt business buttons. <!-- created=2026-05-22, last=2026-05-22 -->