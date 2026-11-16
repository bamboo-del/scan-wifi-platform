# 轻连 WiFi 视觉规格

The generated concepts in `docs/design-concepts/` are the implementation reference for the admin web and mini-program.

## Direction

- True white main canvas with a pale cool gray-blue navigation rail.
- Dark ink text; restrained teal-green is the sole primary/connectivity accent.
- Open table and form layouts with thin dividers. Cards are used only for meaningful KPI or status groups.
- 10–14 px admin radii, 14–18 px mini-program radii, subtle 1 px borders, almost no shadow.
- Chinese system sans-serif stack; admin controls 12–14 px, body 14–16 px, page headings 24–30 px.
- Outline icons use a consistent rounded 1.75 px stroke. Motion is limited to loading, progress, and small state transitions.

## Admin inventory

- Shell: fixed desktop sidebar, quiet page header, responsive drawer under 900 px.
- Components: Button, Input, Select, Switch, Badge, Card, Table, Dialog, Alert, Skeleton, Tabs, Toast.
- Dashboard: five KPIs, seven-day trend, funnel, recent-store table with a real date/status filter.
- Store editor: tabbed detail, open two-column form, password replacement-only flow, operational side rail, QR preview/download/state actions.
- Required states: loading, empty, error, success, disabled, validation error, confirmation dialog.

## Mini-program inventory

- Single page order: collapsible native ad, mark, welcome, SSID, primary connect action, privacy-safe helper, state block, troubleshooting, provider footer.
- States: waiting, initializing_wifi, connecting, success, failed, unsupported, permission_denied, wifi_disabled.
- The ad container never overlays the connect action and fully collapses on failure/no-fill.

## Copy lock

- Admin navigation: `仪表盘`, `门店管理`, `二维码`, `操作日志`, `系统设置`.
- Dashboard: `门店总数`, `启用二维码`, `今日扫码量`, `今日连接成功`, `今日成功率`, `近 7 天连接趋势`, `连接漏斗`, `近期门店`.
- Mini-program primary copy: `一键连接 Wi-Fi`, `重新连接`, `查看手动解决方式`, `本服务由轻连 WiFi 提供`.

## Concept files

- `admin-dashboard.png`: 1440×1024 dashboard composition.
- `store-editor.png`: 1440×1024 store form and QR operations.
- `mini-program-states.png`: waiting, connecting, and failure-state board.
