# 乐谱阅读与编辑

Music 和 Admin 共用 `packages/ui/src/score-reader.tsx`。PDF 与图片支持单页、双页、连续滚动、缩略图、页码输入、滑条和方向键导航。

PDF 按当前页优先调度，相邻页面提前渲染；同时最多运行两个渲染任务。高分辨率缓存保留最近十张位图，缩略图缓存最多八十张，连续阅读时离开视口的画布会释放像素内存。关闭阅读器会取消任务并销毁 PDF 文档。

后台点击乐谱标题进入阅读与批注。画笔、直线、颜色、粗细、橡皮擦和 Ctrl / ⌘ Z 撤回均可使用。橡皮擦删除整条批注笔画，不修改原始谱面。批注保存后会显示在公开 Music 阅读器中；下载按钮下载原始 PDF，不会将批注写入下载文件。

上传 PDF 或图片后可以打开「预览与批注」。图片缩略图可点击裁剪，也可拖动排序。屏幕截图通过浏览器的屏幕/窗口选择器获取，完成抓图后立即停止共享；不支持该接口时可用系统截图后粘贴。截图自动进入裁剪预览。

上传和信息编辑中的「应用到待保存乐谱」只更新本地草稿，需要继续点击「上传」或「保存」。已有乐谱阅读器的「保存批注」直接保存。裁剪图片时批注按裁剪区域重新计算坐标；排序和替换上传通过稳定的页面标识保留对应关系。

# 发布

新增迁移 `20260923000000_score_annotations`，为 `MusicScore` 增加可空的 JSONB 批注字段。已有记录无需回填。API 必须在迁移后启动；现有 API Docker 启动命令会自动执行 `prisma migrate deploy`。非 Docker 发布时，应先在目标数据库环境执行：

```sh
pnpm --filter api exec prisma migrate deploy
```

# 验证

```sh
node --test packages/ui/src/score-model.test.mjs
pnpm --filter api test -- --runInBand music-score.service.spec score-annotation.dto.spec create-music-score.dto.spec
pnpm --filter music check-types
pnpm --filter admin check-types
pnpm --filter @repo/ui check-types
```

浏览器验证覆盖 79 页 PDF、跳页与连续滚动、快速翻页和缩放、批注与撤回、保存失败重试、重新打开后的批注、裁剪上传、截图流释放、本地 PDF 预览以及手机布局。外部存储写入使用本地模拟接口验证，未向线上乐谱写入测试数据。
