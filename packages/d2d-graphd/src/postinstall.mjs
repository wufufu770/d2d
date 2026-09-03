// postinstall — 诚实版: 默认 noop, 只打印指引, 绝不静默安装任何东西。
// 参考实现在 postinstall 里静默 pip install 是缺陷(离线环境炸/供应链面扩大), 本实现不装。
// kuzu 版本由仓库根 requirements.txt 钉定; 需要时用户手动执行下列命令。

if (process.env.D2D_GRAPHD_POSTINSTALL !== '0') {
  console.log(`
[@wufufu770/d2d-graphd] postinstall: 未安装任何依赖(有意为之)。
graphd 是 Python 服务, kuzu 版本钉定在仓库根 requirements.txt。
如需本地图数据库服务, 请手动执行:
    pip install -r requirements.txt
    python3 graphd/app.py        # 默认监听 http://127.0.0.1:8766
跳过本提示: D2D_GRAPHD_POSTINSTALL=0
`)
}
export default 0
