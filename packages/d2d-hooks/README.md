# @wufufu770/d2d-hooks

7 事件 hook 引擎，纯逻辑可测。

## 事件

`session-start` / `session-end` / `pre-worker-spawn` / `post-worker-terminal` /
`pre-write` / `finding-verified` / `error`

## matcher

- 缺省 / `'always'`：恒匹配；
- 精确串：全等；
- `'a|b'`：按 `|` 切分多选；
- `/…/`、`/…/i` 等：按正则串解析。

matcher 对 `ctx.tool`（缺省 `ctx.kind`）匹配，事件名恒匹配。

## 执行与失败模式

```js
runHooks(event, ctx, hooks, { spawnProcess }) // 纯逻辑, spawnProcess 注入(默认 child_process.spawnSync)
```

每个 hook：`{ event, matcher?, command, failMode? }`。sync 顺序执行；
`failMode: 'warn'`（默认）记 warning 继续；`'block'` 时结果 `blocked: true` 并停止后续 hook。

## 权限声明（诚实化）

**hook 以当前运行 d2d 的用户权限执行。本引擎不做任何 uid/gid 降级、不做沙箱**——
hook 脚本与调度器同权限，请只放你完全信任的命令。（参考实现曾虚报「hook 以受限
用户执行」，此处纠正为如实描述。）
