---
name: management-api
description: Guides work on the Management (SPC) page. Use when changing frontend/src/app/(shell)/management/page.tsx.
disable-model-invocation: true
---
# Management / SPC page

There is no dedicated `managementApi.ts`. The SPC page embeds Grafana panels directly.

When changing Management UI, keep page responsibilities in
`frontend/src/app/(shell)/management/page.tsx` and do not reintroduce an empty API stub.
