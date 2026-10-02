# Workloom内置字体许可证

Workloom当前在前端默认 CSS（[`src/index.css`](../src/index.css)）中以 `font-family` 引用名的形式使用以下两款开源字体。两款字体均采用 SIL Open Font License 1.1，可在开源项目中免费使用、修改与再分发，但不可单独售卖字体本身。

| 字体 | 用途 | 许可证 | 链接 |
| --- | --- | --- | --- |
| Hanken Grotesk | 正文与界面默认无衬线字体 | SIL Open Font License 1.1 | <https://github.com/marcologous/hanken-grotesk/blob/master/OFL.txt> |
| Source Serif 4 | 标题与展示型衬线字体 | SIL Open Font License 1.1 | <https://github.com/adobe-fonts/source-serif/blob/release/LICENSE.md> |

## 部署注意事项

- Workloom默认不打包字体文件，仅通过 `font-family` 引用名调用，浏览器会按系统/网络字体回退。如果你希望在自托管实例中确保渲染一致，可自行下载上述字体的 OTF/TTF/WOFF2 文件，并放置到 `public/fonts/` 目录中，再在 `src/index.css` 中追加 `@font-face` 声明。
- 当你打包字体文件分发时，**必须** 同时附带对应字体的 OFL 许可证文件，保留原始版权声明，且不能在分发协议中重新授权这些字体。
- 修改后的字体不可继续使用 Reserved Font Name（如 `Hanken Grotesk`、`Source Serif`）作为字体名。

## 用户导入字体

Workloom在「设置 → 字体管理」中允许用户记录自行导入的字体家族名及来源。出于版权风险考量，Workloom：

- 默认 **不** 上传字体二进制文件；
- 在导入表单中强制勾选「我已确认拥有该字体在当前场景下的合法授权」，并将该确认存入数据库；
- 字体导入仅对当前实例与导入者本人可见，不会自动同步给其他用户或导出公网。

如果你希望在自托管实例中分发额外字体，请确保该字体允许在你的部署场景下使用，并将字体许可证附加在仓库内。
