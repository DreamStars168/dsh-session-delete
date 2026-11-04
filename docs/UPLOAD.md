# 上传到 GitHub

三条路，从省事到手动。**第 0 步是三者共用的**，先做完再看选哪条。

## 第 0 步：在 GitHub 建一个空仓库

打开 <https://github.com/new>：

| 字段 | 填什么 |
| --- | --- |
| Repository name | `dsh-session-delete` |
| Description | 可留空，推送后从 package.json 自动读 |
| Public / Private | 选 **Public**（开源发布） |
| Add a README file | **不勾** |
| Add .gitignore | **不勾** |
| Choose a license | **不勾** |

> 三个"不勾"很关键。仓库里已经有 README、.gitignore 和 LICENSE 了；在网页上初始化会造出一个与本地无关的提交，首次推送就得处理冲突。

建好后记下仓库地址，形如 `https://github.com/<你的用户名>/dsh-session-delete.git`。

## 路线 A：一键脚本（推荐）

仓库里带了 `scripts/publish.ps1`，把替换占位符、自检、提交、关联远程、推送全串起来：

```powershell
cd <local-checkout>
.\scripts\publish.ps1
```

它会依次问你要 GitHub 用户名和提交邮箱，然后：

1. 把 15 处 `DreamStars168` 换成你的用户名
2. 跑 `npm run check` 和 `npm test`，**任一失败就停下**，不会把坏代码推上去
3. 设置本仓库的提交身份（只写进 `.git/config`，不动你的全局配置）
4. 首次提交
5. 关联 `origin` 并推送

也可以一次给全参数：

```powershell
.\scripts\publish.ps1 -Owner octocat -Email "12345+octocat@users.noreply.github.com"
```

用 SSH 的话加 `-Protocol ssh`（需先配好密钥）。

**关于邮箱**：脚本默认给你 `<用户名>@users.noreply.github.com`。这个地址是 GitHub 提供的隐私邮箱，提交记录里不会出现你的真实邮箱。想用真实邮箱就直接填。

**关于登录**：Windows 版 Git 自带 Credential Manager，首次 `git push` 会弹浏览器让你授权 GitHub 账号。登录一次，Windows 凭据管理器会记住，之后不用再输。

## 路线 B：手动命令

```powershell
cd <local-checkout>

# 1. 替换占位符（先 --dry 看一眼再真跑）
node scripts/rename-repo.mjs <你的GitHub用户名> --dry
node scripts/rename-repo.mjs <你的GitHub用户名>

# 2. 确认没问题
npm run check
npm test

# 3. 设置提交身份（只对本仓库生效）
git config user.name "<你的GitHub用户名>"
git config user.email "<你的邮箱>"

# 4. 提交
git add -A
git commit -m "feat: 首个公开发布版本"

# 5. 关联并推送
git remote add origin https://github.com/<你的GitHub用户名>/dsh-session-delete.git
git push -u origin main
```

## 路线 C：装 GitHub CLI

`gh` 能连"建仓库"这一步都省掉：

```powershell
winget install --id GitHub.cli
# 装完重开一个终端
gh auth login          # 按提示选 GitHub.com → HTTPS → 浏览器登录

cd <local-checkout>
node scripts/rename-repo.mjs <你的GitHub用户名>
git config user.name "<你的GitHub用户名>"
git config user.email "<你的邮箱>"
git add -A
git commit -m "feat: 首个公开发布版本"

gh repo create dsh-session-delete --public --source=. --remote=origin --push
```

最后一行会自动建仓库并把当前分支推上去。本机目前没装 `gh`，想用这条得先执行 `winget install`。

## 推送之后

**CI 自动跑起来。** 首次推送会触发 [.github/workflows/ci.yml](../.github/workflows/ci.yml)，在 Ubuntu / Windows / macOS 三系统 × Node 18/20/22 三版本上跑测试，另外打包一次 npm tarball 并列出内容。

看结果：`https://github.com/<你的用户名>/dsh-session-delete/actions`

**打标签发布版本。** 想生成 GitHub Release：

```powershell
git tag v1.1.0
git push origin v1.1.0
```

然后在仓库页面的 Releases → Draft a new release，选 `v1.1.0` 标签，把 `CHANGELOG.md` 里对应段落贴进说明即可。

**让你的 DSH 装上它。** 发布后在任何 DSH 里都能这样装：

```
https://github.com/<你的用户名>/dsh-session-delete.git
```

粘到侧栏 **插件**页的 Git 安装框里就行。

## 卡住了看这里

**`git push` 报 `Repository not found`**

远程仓库没建，或建成了 Private 但你还没推送前就用了错误凭据。先去 <https://github.com/new> 建一个空的 Public 仓库。

**`git push` 报 `failed to push some refs`**

多半是第 0 步勾了 "Add a README file"，远程已有一个提交。二选一：

```powershell
# 方案一：允许合并无关历史
git pull origin main --allow-unrelated-histories
git push -u origin main

# 方案二：强行覆盖远程（新建的空仓库无所谓）
git push -u origin main --force
```

**弹不出登录窗口 / 一直提示输密码**

GitHub 早已停用账号密码推送，必须用 token 或 Credential Manager。清掉旧凭据再重试：

```powershell
cmdkey /list | Select-String github
cmdkey /delete:git:https://github.com
```

**网络超时**

走代理：

```powershell
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
```

用完想取消就把两条命令的地址改成空字符串再跑一次。

**推送前想再确认一遍有没有敏感信息**

```powershell
npm run check
```

里面那道隐私扫描会拦本机绝对路径、API Key、私钥、GitHub token、AWS Access Key。全绿再推。
