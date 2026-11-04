# Systems Design Lab · 系统设计实验室

蓝橙机械臂互动网站：全屏数据流开场、机械臂线稿绘制、Enter 过渡、标签联动、机械臂精确触达与虚化弹窗。页面以英文为主、中文为辅。

线上网站：[Systems Design Lab](https://weiyao-yang.github.io/systems-design-lab/)。仓库保留完整可编辑源码，可在另一台电脑通过 Git 克隆或下载 ZIP 后继续编辑、预览和部署。

首屏直接呈现开场数据界面。数据持续平滑向上滚动约 1.1 秒，模型准备就绪后，约 60 条蓝橙引线从四面八方一次连续汇入，直到沿真实轮廓构成完整机械臂；绘制约持续 4.2 秒，中途不重新发射。每条引线都携带随行的数据标签，标签为无边框、无底框的悬浮文字，字号与明暗分层；结束时引线沿路径平滑收进机械臂。开场标题先绘制橙色制图分格线，约 2.4 秒画完，短暂停顿后蓝色字母再淡入；同一行字母共用贯穿整行的上下横线，分格线严格对齐，交点处的出头长短不一。标题上方显示 Led by Weiyao Yang, Ph.D.，黑色不透明度为 90%，字号为标题的一半，并与 SYSTEMS 的字形左缘对齐。线条几何在测量时生成并缓存，显现时仍沿用机械臂的共享时钟。点击 Enter 时数据和文字同步淡出，机械臂保留原位。REBOOT 可重新播放。

这是完整的可编辑源码。把整个项目下载到另一台电脑后，可以继续预览、修改并重新部署，无需原来的电脑或开发环境。

## 1. 在另一台电脑下载项目

先安装 [Node.js 22 或更高版本](https://nodejs.org/zh-cn/download)。项目的预览、检查和构建使用 Node.js 内置功能，没有需要 `npm install` 安装的依赖。

### 方式 A：Git 克隆，推荐用于持续修改

安装 Git 后，在终端执行：

```sh
git clone https://github.com/weiyao-yang/systems-design-lab.git
cd systems-design-lab
```

克隆会保留 Git 历史和发布工作流，之后可以直接提交、推送修改。

### 方式 B：下载 ZIP

打开 [项目仓库](https://github.com/weiyao-yang/systems-design-lab)，点击 **Code → Download ZIP**，解压整个压缩包。在解压后的项目文件夹中打开终端；该文件夹应包含 `package.json` 和 `index.html`。

请保留 `.github/`、`.gitignore` 和 `.nojekyll` 等以点开头的文件或文件夹。

## 2. 本地预览与修改

在项目根目录执行：

```sh
npm start
```

浏览器打开 `http://localhost:4173/`。修改并保存文件后，刷新浏览器查看效果；在终端按 `Ctrl+C` 停止预览。请通过此本地服务器打开页面，JavaScript 模块不能依赖双击 HTML 文件运行。

| 想修改的内容 | 对应文件 |
| --- | --- |
| 六个弹窗的文字与中英文内容 | `content.js` |
| 颜色、字体、尺寸、位置、响应式外观 | `styles.css` |
| 机械臂原始外形、关节和运动 | `robot.js` |
| 蓝色外壳轮廓、隐藏线和透视线稿 | `robot-drawing.js` |
| 开场从屏幕四周引入的线条路径与接入动画 | `intro-traces.js` |
| 橙色内部轴承、齿轮、电机和传动结构 | `robot-internals.js` |
| 页面结构、标签、开屏布局 | `index.html` |
| 开场阶段、数据流、弹窗、音效、标签和按钮交互 | `app.js` |

`three.module.js` 是已随项目打包的 Three.js 运行库，其许可保存在 `THREE-LICENSE.txt`。通常无需修改这两个文件。

开场线条和数据标签使用单个画布绘制，并缓存曲线路径与文字；不支持画布的环境保留 SVG 回退。开场机械臂姿态固定时合并深度预绘制，进入主页后恢复原有模型与交互。

如果新增图片、字体、JavaScript 等网站资源，请同时把每个文件的相对路径加入 `scripts/files.mjs` 中的 `websiteFiles` 数组，例如 `assets/example.png`。本地预览和构建只包含这份清单里的文件；新增文件夹中的文件也需要逐项列出，并随源码一起提交。

## 3. 检查与生成部署文件

修改完成后执行：

```sh
npm run check
npm run build
```

`check` 检查 JavaScript 语法和静态资源引用；`build` 将网站静态文件复制到 `dist/`，供部署使用。`dist/` 是生成目录，继续修改时请编辑项目根目录里的源码。

## 4. 发布到 GitHub Pages

仓库包含 `.github/workflows/deploy.yml`。在仓库 **Settings → Pages → Source** 中选择 **GitHub Actions**，此项只需配置一次。

配置依据：[GitHub Pages 自定义工作流官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

### 使用 Git 提交修改

使用你自己的 GitHub 账号登录，并确认对目标仓库有写入权限。在克隆的项目目录执行：

```sh
git add .
git commit -m 'Update website'
git push origin main
```

推送到 `main` 后，GitHub Actions 会运行检查、构建并部署 GitHub Pages。可在仓库 **Actions** 页面查看结果，也可以选择部署工作流后点击 **Run workflow** 手动触发。首次部署成功后，在 Pages 设置或工作流结果中查看网站访问地址。

如果你使用另一个账号且没有原仓库的写入权限，请先 **Fork** 到自己的账号，再克隆自己的仓库、配置 Pages，并在 Actions 页面按提示启用工作流。之后推送到你自己的 `main` 分支即可部署。

### 使用下载的 ZIP 修改

可以在 GitHub 网页中将修改后的文件上传到目标仓库的 `main` 分支并提交，保留原有 `.github/` 工作流和其他源码文件；首次上传整个项目时也要包含这些隐藏文件。提交后由同一工作流自动部署。

ZIP 不含 `.git` 历史，解压目录不能直接执行上面的 `git push`。若要改用 Git 提交，请先克隆仓库，再把本地修改复制到克隆目录中提交。

## 可迁移性与外部资源

- 本地资源均使用相对路径，可部署到 GitHub Pages 的项目子路径，也可放到其他静态服务器。
- Three.js 已包含在项目中。Google Fonts 仍由样式表远程加载，无法访问时使用系统字体回退。
- 项目不包含账号凭据或访问令牌。GitHub 身份验证由你自己的账号完成。
- 联系简报仅下载到本机，页面没有提交或上传信息的后端服务。
