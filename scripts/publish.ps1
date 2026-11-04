<#
.SYNOPSIS
    把 dsh-session-delete 一键发布到 GitHub。

.DESCRIPTION
    依次完成：替换仓库占位符 → 设置本仓库的提交身份 → 首次提交 → 关联远程 → 推送。
    提交身份只写进本仓库的 .git/config，不动你的全局 git 配置。

.PARAMETER Owner
    你的 GitHub 用户名。不给就交互式询问。

.PARAMETER Email
    提交用的邮箱。建议用 GitHub 的 noreply 邮箱，避免暴露真实邮箱。

.PARAMETER Repo
    仓库名，默认 dsh-session-delete。

.PARAMETER Protocol
    https（默认，会弹浏览器登录）或 ssh（需要先配好 SSH key）。

.EXAMPLE
    .\scripts\publish.ps1 -Owner octocat -Email 12345+octocat@users.noreply.github.com

.EXAMPLE
    .\scripts\publish.ps1
#>
[CmdletBinding()]
param(
    [string]$Owner,
    [string]$Email,
    [string]$Repo = 'dsh-session-delete',
    [ValidateSet('https', 'ssh')]
    [string]$Protocol = 'https',
    [switch]$SkipPush
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# 脚本放在 scripts/ 下，仓库根是它的上一级
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Write-Step {
    param([string]$Text)
    Write-Host ''
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Text)
    Write-Host "    $Text" -ForegroundColor DarkGray
}

# ---------------------------------------------------------------- 前置检查

Write-Step '检查环境'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw '找不到 git，请先安装：https://git-scm.com/download/win'
}
Write-Ok "git $(git --version)"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw '找不到 node，请先安装 Node.js 18+：https://nodejs.org'
}
Write-Ok "node $(node --version)"

# ---------------------------------------------------------------- 收集参数

Write-Step '确认仓库信息'

if (-not $Owner) {
    $Owner = Read-Host '你的 GitHub 用户名'
}
if (-not $Owner) { throw 'GitHub 用户名不能为空' }
if ($Owner -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$') {
    throw "不是合法的 GitHub 用户名: $Owner"
}

if (-not $Email) {
    # 没有确认过用户名就先问，这里给一个可直接用的默认值
    $default = "$Owner@users.noreply.github.com"
    $input = Read-Host "提交邮箱（回车使用 $default）"
    $Email = if ([string]::IsNullOrWhiteSpace($input)) { $default } else { $input }
}

$remoteUrl = if ($Protocol -eq 'ssh') {
    "git@github.com:$Owner/$Repo.git"
} else {
    "https://github.com/$Owner/$Repo.git"
}

Write-Ok "仓库页  : https://github.com/$Owner/$Repo"
Write-Ok "远程地址: $remoteUrl"
Write-Ok "提交身份: $Owner <$Email>"

# ---------------------------------------------------------------- 替换占位符

Write-Step '替换仓库地址占位符'

$rename = Join-Path $PSScriptRoot 'rename-repo.mjs'
node $rename $Owner --repo $Repo
if ($LASTEXITCODE -ne 0) { throw 'rename-repo.mjs 执行失败' }

# ---------------------------------------------------------------- 自检

Write-Step '发布前自检'

npm run check
if ($LASTEXITCODE -ne 0) { throw 'npm run check 未通过，先修好再发布' }

npm test
if ($LASTEXITCODE -ne 0) { throw 'npm test 未通过，先修好再发布' }
Write-Ok '语法、清单、隐私扫描、46 项单测全部通过'

# ---------------------------------------------------------------- 提交

Write-Step '创建首次提交'

# 身份只写进本仓库，不污染全局配置
git config user.name $Owner
git config user.email $Email

git add -A

# 已经有提交就不重复提交
$hasCommit = git rev-parse --verify HEAD 2>$null
if ($LASTEXITCODE -eq 0 -and $hasCommit) {
    Write-Ok '已有提交历史，本次跳过提交'
} else {
    $message = @(
        'feat: 首个公开发布版本',
        '',
        '- 会话行菜单「删除会话」：彻底删除该会话（含子智能体会话）的日志目录、投影缓存与工作区记账',
        '- 会话行右键复用宿主原生菜单',
        '- 删除当前会话后自动在原工作区新开空会话',
        '- 附带 CLI：默认预演，--apply 才动手',
        '- HTTP 路由仅接受 POST 与同源/回环请求',
        '- 46 项单测 + 隐私密钥扫描'
    ) -join "`n"
    git commit -m $message
    if ($LASTEXITCODE -ne 0) { throw 'git commit 失败' }
}

git log --oneline -1
Write-Ok "当前分支: $(git rev-parse --abbrev-ref HEAD)"

# ---------------------------------------------------------------- 关联远程

Write-Step '关联远程仓库'

$existing = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
    if ($existing -ne $remoteUrl) {
        git remote set-url origin $remoteUrl
        Write-Ok "已更新 origin: $remoteUrl"
    } else {
        Write-Ok "origin 已是 $remoteUrl"
    }
} else {
    git remote add origin $remoteUrl
    Write-Ok "已添加 origin: $remoteUrl"
}

# ---------------------------------------------------------------- 推送

if ($SkipPush) {
    Write-Step '已跳过推送'
    Write-Host ''
    Write-Host '手动推送：' -ForegroundColor Yellow
    Write-Host "  git push -u origin main"
    exit 0
}

Write-Step '推送到 GitHub'

Write-Host ''
Write-Host '接下来可能会弹出一个浏览器窗口让你登录 GitHub。' -ForegroundColor Yellow
Write-Host '这是 Git Credential Manager 在申请授权，登录一次之后就不用再输了。' -ForegroundColor Yellow
Write-Host ''

# 远程仓库必须先在 GitHub 网页建好，push 不会自动创建
git ls-remote --exit-code origin 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host '提醒：远程仓库似乎还不存在或无法访问。' -ForegroundColor Yellow
    Write-Host "请先在浏览器打开 https://github.com/new 创建 $Repo（不要勾选任何初始化文件），然后回车继续。" -ForegroundColor Yellow
    Read-Host '建好后按回车' | Out-Null
}

git push -u origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '推送没有成功。常见原因与处理：' -ForegroundColor Red
    Write-Host '  1. 远程仓库尚未创建 → 打开 https://github.com/new 建一个空仓库（不要勾 README）'
    Write-Host '  2. 登录窗口被关掉了 → 重新运行本脚本，或在终端执行 git push -u origin main'
    Write-Host '  3. 用户名或仓库名拼错 → 核对 package.json 的 repository.url'
    Write-Host '  4. 公司网络拦截 → 设置代理：git config --global http.proxy http://127.0.0.1:7890'
    exit 1
}

Write-Step '发布完成'
Write-Host ''
Write-Host "  仓库    https://github.com/$Owner/$Repo" -ForegroundColor Green
Write-Host "  Actions https://github.com/$Owner/$Repo/actions" -ForegroundColor Green
Write-Host "  Issues  https://github.com/$Owner/$Repo/issues" -ForegroundColor Green
Write-Host ''
Write-Host 'CI 会自动在 3 个系统 × 3 个 Node 版本上跑测试。' -ForegroundColor DarkGray
Write-Host '打版本标签可触发 GitHub Release：' -ForegroundColor DarkGray
Write-Host '  git tag v1.1.0 && git push origin v1.1.0' -ForegroundColor DarkGray
