---
title: "Base URL及鉴权--火山方舟-火山引擎"
source: "https://www.volcengine.com/docs/82379/1298459?lang=zh"
author:
published:
created: 2026-03-19
description: "火山引擎官方文档中心，产品文档、快速入门、用户指南等内容，你关心的都在这里，包含火山引擎主要产品的使用手册、API或SDK手册、常见问题等必备资料，我们会不断优化，为用户带来更好的使用体验"
tags:
  - "clippings"
---
火山方舟

文档指南 API参考 资源

火山方舟

![](https://www.volcengine.com/docs/82379/) ![](https://www.volcengine.com/docs/82379/) ![](https://www.volcengine.com/docs/82379/)

准备工作

Base URL及鉴权

复制全文

[我的收藏](https://www.volcengine.com/docs/favorite)

火山方舟API分为模型调用的API（数据面 API），及管理推理接入点等管控相关的管控面 API。他们支持的鉴权方式有所不同，下面介绍方舟API的鉴权方式。

概念解释

- 管控面 API ：用于 系统资源管理、配置控制和状态监控 的接口。它专注于管理和调度数据面及系统资源，是保障系统稳定运行的“控制中枢”。例如，在方舟中用于管理 API Key、基础模型等接口，均属于管控面 API。

- Base URL ：是构建完整 API 请求 URL 的 “基础模板”，包含 协议（如 http/https）、host（主机域名或 IP）、端口（可选）和基础路径（可选） ，是所有具体接口路径的 “公共前缀”。你可以根据Base URL 加接口/版本等参数拼接出完整接口 URL ，典型结构： \[协议\]://\[host\]/\[基础路径（可选）\]

Base URL

注意

下面给到的数据面 API 与 Coding Plan 支持的 Base URL 不同。Coding Plan 用户请使用正确的 Base URL，避免因地址错误产生额外费用，具体参见 [Base URL](https://www.volcengine.com/docs/82379/1928261#7fd1eee7) 。

各接口类型对应的 Base URL。

- 数据面 API：https://ark.cn-beijing.volces.com/api/v3

- 管控面 API：https://ark.cn-beijing.volcengineapi.com/

支持两种鉴权方式，API Key 鉴权（简单方便），与 Access Key 鉴权（传统云上资源权限管控，可以分资源组云产品等维度管理，面向企业精细化管理）。

前提条件

说明

方舟平台的新用户？获取 API Key 及 开通模型等准备工作，请参见 [快速入门](https://www.volcengine.com/docs/82379/1399008) 。

签名构造

Authorization: Bearer $ARK\_API\_KEY

示例如下

curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \\

\-H "Content-Type: application/json" \\

\-H "Authorization: Bearer $ARK\_API\_KEY" \\

\-d '{

"model": "doubao-seed-2-0-lite-260215",

"messages": \[

{

"role": "system",

"content": "You are a helpful assistant."

},

{

"role": "user",

"content": "Hello!"

}

\]

}'

- 可按需替换 Model ID。查询 Model ID见 [模型列表](https://www.volcengine.com/docs/82379/1330310) 。

前提条件

你已获取到Access Key。如需创建/查看Access Key，请参见 [API访问密钥管理](https://www.volcengine.com/docs/6257/64983) 。

由于主账号的Access Key拥有较大权限，建议你创建IAM用户并授予方舟等权限，然后使用IAM用户的 Access Key 来进行操作，具体请参见 [使用 IAM 管理权限](https://www.volcengine.com/docs/82379/1263493) 。

使用示例

见 [使用Access Key鉴权](https://www.volcengine.com/docs/82379/1544136#fa44b913) 。

通过Access Key 鉴权，model 字段 需配置为 Endpoint ID。

管控面的API，如管理API Key、管理推理接入点等接口。

获取Access Key。如需创建/查看Access Key，请参见 [API访问密钥管理](https://www.volcengine.com/docs/6257/64983) 。

方法：使用示例/说明（简单，推荐）

参见 [SDK 接入指南](https://api.volcengine.com/api-sdk/view?serviceCode=ark&version=2024-01-01&language=Java) 。

方法：自行实现签名（实现成本高，不推荐）

1. 使用 Access Key 构造签名。具体方法请参见 [签名方法](https://www.volcengine.com/docs/6369/67269) 。

签名用到的方舟相关字段信息：

- Service： ark

- Region： cn-beijing

1. 使用cURL发起请求，请求示例如下：

最近更新时间：2026.03.13 15:51:27

这个页面对您有帮助吗？

有用

有用

无用

无用

售前客服

售后客服

购买咨询

rangeDom