---
name: generate-anki-cards-from-yaml
description: Generate Anki flashcards from structured YAML definitions and auto-import into Anki.
version: 1
created: 2026-07-17
updated: 2026-07-17
---
## When to Use
When the user wants to create Anki flashcards from structured notes/knowledge. Use for JVM, Java, or any technical topic that benefits from spaced repetition.

## Procedure
1. **Create a YAML file** with the following structure:
   ```yaml
   deck: 架构::主题::子主题
   description: 卡片组描述
   cards:
     - front: 问题
       back: 答案（可用 HTML 标签）
       extra: 额外说明（可选）

     - type: code
       front: 代码题目
       back: 说明
       code: |
         代码内容

     - type: table
       front: 对比表格
       headers: [列1, 列2]
       rows:
         - [行1值1, 行1值2]
   ```

2. **Run the generation**:
   - 生成 .apkg: `python -m ankigen cards.yml`
   - 生成并导入: `python -m ankigen cards.yml --import`
   - 指定输出: `python -m ankigen cards.yml -o out.apkg`

3. **Verify** the cards appear in Anki deck.

## Tools Location
- ankigen package: `S:/tool/ankigen/`
- Example YAML: `S:/tool/ankigen/jvm_bytecode.yml`
- Anki executable: `S:/tool/Anki.exe`
- Anki collection: `C:\Users\leizh\AppData\Roaming\Anki2\账户 1\collection.anki2`

## Notes
- YAML 值中如果包含 `: `（英文冒号+空格），必须使用引号包裹
- 卡组名用 `::` 分隔层级，如 `架构::JVM::字节码`
- 卡片通过内容生成的 GUID 自动去重