# 项目 SSH 配置

这个目录用于放置本项目专用的 GitHub SSH key。

已提交到仓库：

- `README.md`
- `id_ed25519_github.pub`，公钥，可以公开

不会提交到仓库：

- `id_ed25519_github`，私钥，只能通过 U 盘、AirDrop、密码管理器等方式单独复制

## 在新电脑上配置

1. 把私钥复制到这个路径：

   ```bash
   ssh/id_ed25519_github
   ```

2. 在项目根目录运行：

   ```bash
   ./scripts/setup-project-ssh.sh
   ```

3. 之后就可以正常使用：

   ```bash
   git pull
   git push
   ```

