---
title: "ListFoundationModels - 获取基础模型列表--火山方舟-火山引擎"
source: "https://www.volcengine.com/docs/82379/1262849?lang=zh"
author:
published:
created: 2026-03-19
description: "火山引擎官方文档中心，产品文档、快速入门、用户指南等内容，你关心的都在这里，包含火山引擎主要产品的使用手册、API或SDK手册、常见问题等必备资料，我们会不断优化，为用户带来更好的使用体验"
tags:
  - "clippings"
---
管理基础模型

ListFoundationModels - 获取基础模型列表

列出基础模型。

## 调试

API Explorer

您可以通过 API Explorer 在线发起调用，无需关注签名生成过程，快速获取调用结果。

## 请求参数

下表仅列出该接口特有的请求参数和部分公共参数。更多信息请见 [公共参数](https://www.volcengine.com/docs/6369/67268) 。

| 参数 | 类型 | 是否必填 | 示例值 | 描述 |
| --- | --- | --- | --- | --- |
| Action | String | 是 | ListFoundationModels | 要执行的操作，取值：ListFoundationModels。 |
| Version | String | 是 | 2024-01-01 | API的版本，取值：2024-01-01。 |
| PageNumber | Integer | 否 | 1 | 分页查询时的起始页码，从 1 开始，默认为 1。 |
| PageSize | Integer | 否 | 10 | 分页查询时每页显示的记录数，取值： - 最小值：1 - 最大值：100 - 默认值：10 |
| Filter | Object | 否 | \- | 待查询基础模型的筛选条件 |
| SortOrder | String | 否 | Desc | 指定排序顺序。 可指定值:  - Asc：升序排列 - Desc：降序排列 |
| SortBy | String | 否 | \- | 指定排序指标。 可指定值：  - CreateTime 创建时间 - UpdateTime 更新时间 |
| TagFilters | Array of Object | 否 | \- | 基于绑定的标签的筛选条件 |

## 返回参数

下表仅列出本接口特有的返回参数。更多信息请参见 [返回结构](https://www.volcengine.com/docs/6369/80336) 。

| 参数 | 类型 | 示例值 | 描述 |
| --- | --- | --- | --- |
| TotalCount | Integer | 2 | 总基础模型数 |
| PageNumber | Integer | 1 | 分页查询时的起始页码，从 1 开始，默认为 1。 |
| PageSize | Integer | 1 | 分页查询时每页显示的记录数，取值： - 最小值：1 - 最大值：100 - 默认值：10 |
| Items | Array of Object | \- | 基础模型列表 |

## 请求示例

```
POST /?Action=ListFoundationModels&Version=2024-01-01 HTTP/1.1
Host: open.volcengineapi.com
Content-Type: application/json; charset=UTF-8
X-Date: 20240514T130015Z
X-Content-Sha256: 287e874e******d653b44d21e
Authorization: HMAC-SHA256 Credential=Adfks******wekfwe/20240514/cn-beijing/ark/request, SignedHeaders=host;x-content-sha256;x-date, Signature=47a7d934ff7b37c03938******cd7b8278a40a1057690c401e92246a0e41085f

{
  "PageNumber": 1,
  "PageSize": 10,
  "Filter": {
    "Name": "1yEK",
    "Names": [
      "b4"
    ],
    "FoundationModelTag": {
      "Languages": [
        "Tv0mxXamkC5"
      ],
      "TaskTypes": [
        "hmqgZGGni"
      ],
      "CustomizedTags": [
        "zafcaqOy"
      ],
      "Domains": [
        "RRamYGIqLt"
      ],
      "UsedLibraries": [
        "Rctg97iyG0G"
      ]
    },
    "Introduction": "sdQb3Q",
    "Description": "ncjtG458V89",
    "DisplayName": "NBgVWD3XwHJ",
    "AccessTypes": [
      "b6Qw9wRLBb"
    ]
  },
  "SortOrder": "Desc",
  "SortBy": "\\-",
  "TagFilters": [
    {
      "Key": "DcuMJa",
      "Values": [
        "5M8sMT"
      ]
    }
  ]
}
text
```

## 返回示例

```json
{
  "ResponseMetadata": {
    "RequestId": "20240514210020173184054004BACCC8",
    "Action": "ListFoundationModels",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {
    "TotalCount": 2,
    "PageNumber": 1,
    "PageSize": 1,
    "Items": [
      {
        "Name": "test-foundation-model",
        "Description": "wxr",
        "Introduction": "language models",
        "VendorName": "vERtPPat6Xz",
        "DisplayName": "sBEA",
        "FeaturedImage": {
          "ObjectKey": "J3Og",
          "BucketName": "5E"
        },
        "PrimaryVersion": "zYCdJe3n",
        "FoundationModelTag": {
          "Languages": [
            "XEQL2sR"
          ],
          "TaskTypes": [
            "ZpMo3"
          ],
          "CustomizedTags": [
            "80woxH8k3Ly"
          ],
          "Domains": [
            "0DQGJbb"
          ],
          "UsedLibraries": [
            "Jijubh2yS"
          ]
        },
        "AccessType": "Public",
        "Tags": [
          {
            "Key": "3",
            "Value": "V"
          }
        ],
        "ProjectName": "default",
        "CreateTime": "2006-01-02T15:04:05Z07:00\n",
        "UpdateTime": "2006-01-02T15:04:05Z07:00\n"
      }
    ]
  }
}
json
```

## 错误码

您可访问 [公共错误码](https://www.volcengine.com/docs/82379/1299023) ，获取更多错误码信息。

最近更新时间：2025.11.06 16:42:50

这个页面对您有帮助吗？[上一篇：](https://www.volcengine.com/docs/82379/1262848)

售前客服

售后客服