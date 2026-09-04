# @wufufu770/d2d-skills

SKILL.md 加载器，零依赖（stdlib only）。

## frontmatter 子集

`---` 包裹的头部，支持简单 YAML 子集：`key: value`（字符串/数字/布尔）、
逗号分隔数组（`allowed-tools: a, b`）、`[a, b]` 形式数组。不支持嵌套/多行/锚点。

支持字段：`name` / `description` / `version` / `category` /
`when_to_use` / `allowed-tools` / `user-invocable`。

## API

```js
import { parseFrontmatter, loadSkill, loadSkillsDir, scoreSkills } from '@wufufu770/d2d-skills'

parseFrontmatter(text)        // → { data, body }
loadSkill(dir)                // → card | null (校验失败抛 SkillError)
loadSkillsDir(root)           // → card[] (跳过无 SKILL.md 的目录, 收集 errors)
scoreSkills(cards, keywords)  // → 按匹配分排序的 card[], 附 .score
```

校验规则：

- `name` 必须等于所在目录名；
- `description` 必填且 ≤ 200 字符；
- `user-invocable` 缺省为 `true`。

## 打分选择器

`scoreSkills(cards, keywords)`：对 `name` 命中 +5、`category` +3、`when_to_use` +2、
`description` +1（子串大小写不敏感），0 分不入选，降序稳定排序。用于运行时按
任务关键词挑选应注入的 skill。

示例 skill 见 `skills/ping/` 与 `skills/recon-report/`。
