# zjmTalk

Node.js + TypeScript 项目，使用 pnpm 管理依赖，Jest 运行单元测试。

## 环境要求

- Node.js >= 18
- pnpm >= 8

## 快速开始

```bash
# 安装依赖
pnpm install

# 编译 TypeScript
pnpm build

# 运行单元测试
pnpm test

# 监听模式运行测试
pnpm test:watch

# 生成测试覆盖率报告
pnpm test:coverage
```

## 项目结构

```
src/
├── index.ts              # 业务代码
└── __tests__/
    └── index.test.ts     # 单元测试
dist/                     # 编译输出（git 忽略）
coverage/                 # 测试覆盖率报告（git 忽略）
```

## 开发流程

1. 在 `src/` 下编写 TypeScript 代码
2. 在 `src/__tests__/` 下编写对应的 `*.test.ts` 测试文件
3. 运行 `pnpm test` 验证
4. 运行 `pnpm build` 编译到 `dist/`
