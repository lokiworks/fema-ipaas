# 北森员工时间窗接口参考

整理时间 2026-10-03，来自北森开放平台接口文档站点（`open.italent.cn` → 应用接口 → 组织员工 → 员工与任职，需要登录）和用户社区的三份取数方案。接口文档页的更新时间是 2026-07-17。其余帮助文档的登记见 [beisen-help-docs.md](beisen-help-docs.md)。

本页服务于「北森到飞书」方案包：员工变动触发、在职、离职、待入职各怎么查，返回里有什么字段，枚举值是什么。字段含义用本页自己的话概括，不逐字转载。标 ★ 的是主线（开通、调整、停用飞书账号）会用到的字段。

## 接口

| 项 | 内容 |
| --- | --- |
| 名称 | 根据时间窗滚动查询变动的员工与单条任职信息 |
| 请求 | `POST openapi.italent.cn/TenantBaseExternal/api/v5/Employee/GetByTimeWindow` |
| 限频 | 50 次/秒/企业、1500 次/分钟/企业（比通用页写的 3000 次/分钟更严） |
| 权限 | 连接器里要同时勾选「员工信息 EmployeeInformation」和「任职记录 EmploymentRecord」两个对象，缺一个报权限异常；字段权限也在连接器里配 |
| 返回 | 每个员工一条员工信息加一条任职记录；员工有多条任职时优先取未删除的主职。要多条任职，用另一个接口「员工与多条任职」（`GetListByTimeWindow`） |
| 只含 | 审批生效的任职记录，**不含审批中**；不含兼职、历史失效的任职 |

## 请求参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `startTime` | date-time | 是 | 时间窗开始，格式 `2021-01-01T00:00:00`；不带时分秒时按 00:00:00 |
| `stopTime` | date-time | 是 | 时间窗结束，格式同上 |
| `timeWindowQueryType` | string | 否 | 1 修改时间，2 业务修改时间，见下 |
| `empStatus` | array | 否 | 人员状态，枚举见下。传了非空数组就按它查；不传且 `withDisabled` 为 false，查待入职、试用、正式、返聘；不传且 `withDisabled` 为 true，查全部状态；传空数组，查试用、正式、返聘 |
| `withDisabled` | boolean | 否 | 是否包含离职记录，默认否，和 `empStatus` 互补 |
| `employType` | array | 否 | 雇佣关系，默认只查内部员工 |
| `serviceType` | array | 否 | 任职类型，默认只查主职 |
| `approvalStatuses` | array | 否 | 审批状态，空或 null 等于只查 4（生效）。**只允许 2（审批通过）和 4（生效）**，其他值不可用 |
| `isGetLatestRecord` | boolean | 否 | 默认 true，取最新主职（生效日期最大的）；false 取当前生效主职（生效日期在今天之前、失效日期在今天之后的） |
| `isWithDeleted` | boolean | 否 | 是否含已删除数据，默认否 |
| `isGetOfferRecord` | boolean | 否 | 是否带出任职记录对应的 Offer，默认否 |
| `scrollId` | string | 否 | 首次传空；之后传上一批返回的值 |
| `capacity` | integer | 否 | 每批条数，默认 100，上限 300 |
| `sort` | dictionary | 否 | 键为字段编码，值 0 不排序、1 升序、2 降序；不传默认按 UserID 升序再按创建时间降序 |
| `columns` | array | 否 | 要取的列，空表示全部；**只决定是否查值，不裁剪响应结构** |
| `extQueries` | array | 否 | 自定义字段条件，多个条件只能「且」；不存在的自定义字段会被静默忽略，不报错 |
| `enableTranslate` | boolean | 否 | 已下线，不要传 |

## timeWindowQueryType 取值

| 值 | 匹配哪些时间 | 什么时候会命中 |
| --- | --- | --- |
| 1（不传时的默认值） | 员工信息或任职记录的创建时间、修改时间，任一落在时间窗内 | 包含人工操作，也包含北森系统任务触发的修改。每天凌晨重算累计工龄、司龄会刷新修改时间，所以会命中大量没有业务变化的员工；客户定制的触发器、定时任务同理 |
| 2 | 员工信息或任职记录的创建时间、业务修改时间，任一落在时间窗内 | 只含入职、转正、调动、编辑员工信息、编辑任职等业务操作引发的变化，不含系统更新 |

创建后从未修改过的数据，三个时间相同，两种取值都能查到。

## 时间窗与翻页规则

- 时间窗最早 `1900-01-01T00:00:00`，最晚 `9999-12-31T00:00:00`。
- **跨度超过 90 天会被拒绝**，返回 `417`，消息是「只支持查询90天范围内的数据，请分段查询」。社区取数方案写的是「三个月」，另有一页问答说不受 90 天限制，三处说法不一致，以接口文档页和实际返回为准，按 90 天分段最稳。
- 每批最多 300 条，两次翻页请求之间**不能超过 10 秒**，超过后下一批取不到，所以要先把所有页取完再处理业务。
- 不能跳页，也不能回退。取完的判断是返回的 `data` 为空或空集合；`isLastData` 已废弃。
- 同一个员工在不同的时间窗里可能各出现一次，且内容相同，调用方要自己去重。
- 首次全量：从接入北森之前的日期起，按不超过 90 天一段顺次往后取，直到当前日期。之后每天取前一天的窗口；官方建议把窗口放宽（例如取近三天），让上一次失败的增量由下一次补上。

## 响应结构

顶层字段：`code`（200 成功，417 参数异常或业务不合法，500 服务端异常）、`message`、`total`、`scrollId`、`isLastData`（废弃）、`data`。

`data` 的每个元素有三部分：`originalId`（第三方系统的外部标识，不是北森的）、`employeeInfo`（员工信息）、`recordInfo`（任职记录）。字段名都是小驼峰。

### employeeInfo（员工信息）

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| ★ `userID` | integer | 员工 UserID，北森侧的员工主键（整数，不是 GUID） |
| ★ `name` | string | 姓名 |
| `_Name`、`givenNames`、`phoneticOfXing`、`phoneticOfMing` | string | 姓名拼音、英文姓名、姓拼音、名拼音 |
| `engName`、`firstname`、`lastname` | string | 其他语言姓名及其名、姓 |
| `gender` | integer | 0 男，1 女 |
| ★ `email` | string | 电子邮件 |
| ★ `workEmail` | string | 工作邮箱 |
| `backupMail` | string | 个人邮箱 |
| ★ `mobilePhone` | string | 手机号码（脱敏展示时形如 `129****1283`） |
| `mobilePhoneBackup` | string | 手机号码备份字段 |
| `iDType`、`iDNumber`、`issuingAuthority` | string | 证件类型、证件号码、签发机关 |
| `isLongTermCertificate`、`certificateStartDate`、`certificateValidityTerm` | boolean、date-time | 是否长期证件、证件起止日期 |
| `passportNumber`、`passportDateOfExpiry` | string、date-time | 护照号、护照有效期 |
| `birthday`、`lunarBirthday`、`gregorianBirthday`、`birthdayMonth`、`birthdayDay`、`birthdayPreferences`、`age` | 混合 | 生日相关及年龄 |
| `workDate` | date-time | 参加工作日期 |
| `firstEntryDate`、`latestEntryDate` | date-time | 首次、最近一次进入公司的日期 |
| `homeAddress`、`residenceAddress`、`registAddress`、`birthplace`、`placeOfBirth`、`businessAddress`、`postalCode` | string | 联系地址、户籍地址、籍贯、户籍所在地、出生地、办公地址、邮编 |
| `weiXin`、`qQ`、`homePhone`、`officeTel` | string | 微信、QQ、家庭电话、办公电话 |
| `iDPhoto`、`smallIDPhoto`、`iDPortraitSide`、`iDCountryEmblemSide`、`iDFront`、`iDBehind` | string | 照片、缩略图、身份证人像面、国徽面、证件正反面；值是 `dfs://` 路径，需要走文件下载接口 |
| `allowToLoginIn` | boolean | 允许登录系统，仅对外部人员有意义 |
| ★ `activationState` | integer | 账号激活状态，0 未激活，1 已激活 |
| `personalHomepage`、`speciality`、`major`、`constellation`、`bloodType`、`aboutMe`、`lastSchool`、`educationLevel` | string | 主页、特长、专业、星座、血型、简介、毕业学校、最高学历 |
| `graduateDate`、`joinPartyDate` | date-time | 毕业时间、入党或入团日期 |
| `domicileType`、`marryCategory`、`politicalStatus`、`nationality`、`nation` | 混合 | 户口类别、婚姻状况、政治面貌、国家或地区、民族 |
| `emergencyContact`、`emergencyContactRelationship`、`emergencyContactPhone` | string | 紧急联系人及关系、电话 |
| `isDisabled`、`disabledNumber`、`isReturnHome`、`isOnlyChild` | 混合 | 是否残疾人、残疾证号、是否留学回国、是否独生子女 |
| `preRetireDate`、`actualRetireDate`、`isConfirmRetireDate` | 混合 | 预计退休日期、实际退休日期、预计退休日期是否已核准 |
| `tutorNew`、`referrerUserID` | integer | 导师、推荐人的 UserID |
| `applicantId`、`applyIdV6`、`applicantIdV6` | 混合 | 应聘者与招聘申请 id，只给北森招聘系统用 |
| `sourceType`、`orderCode`、`timeZone` | 混合 | 类型、排序编码、时区 |
| ★ `objectId` | string | 员工实体的主键 GUID，与 `userID` 是两个不同的东西 |
| `customProperties` | dictionary | 租户自定义字段，键是字段编码，无值时不返回 |
| `sysMartionProperties` | dictionary | 标准字段的多语言值，有值才返回，后缀 `_en_US`、`_zh_TW`、`_fr` |
| `translateProperties` | dictionary | 动态翻译，已下线，恒为 null |
| `businessModifiedBy`、`businessModifiedTime` | integer、date-time | 业务修改人和时间，系统更新时不变 |
| `createdBy`、`createdTime`、`modifiedBy`、`modifiedTime` | 混合 | 创建与修改信息，系统更新时会变 |
| ★ `stdIsDeleted` | boolean | 是否已删除 |

### recordInfo（任职记录）

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| ★ `userID` | integer | 所属员工的 UserID |
| `pObjectDataID` | string | 所属员工实体的主键 GUID |
| ★ `staffID` | string | 员工 ID（GUID） |
| ★ `jobNumber` | string | 工号 |
| ★ `oIdDepartment` | integer | 任职部门的 OId，**只有编号，没有部门名称** |
| ★ `oIdOrganization` | integer | 任职机构（如子公司）的 OId |
| `businessOrganizationOId`、`profitCenterOId`、`reservedOrganization4OId`、`reservedOrganization5OId`、`stdBusinessUnitID` | integer | 业务组织、利润中心、预留组织、业务单元 |
| ★ `employeeStatus` | string | 人员状态，枚举见下 |
| ★ `employType` | integer | 雇佣关系 |
| `serviceType` | integer | 任职类型 |
| `serviceStatus` | integer | 任职状态，0 任职中，1 任职结束 |
| ★ `approvalStatus` | integer | 审批状态 |
| ★ `startDate`、`stopDate` | date-time | 任职记录的生效、失效时间，构成时间轴 |
| ★ `entryDate` | date-time | 入职操作时的入职日期 |
| ★ `lastWorkDate` | date-time | 离职操作时的最后工作日；**最后工作日当天仍是在职，次日起为离职** |
| `regularizationDate`、`probation`、`isHaveProbation`、`probationStartDate`、`probationStopDate`、`probationActualStopDate`、`probationResult` | 混合 | 转正日期、试用期月数及起止、实际结束日期、结果 |
| `traineeStartDate` | date-time | 实习开始日期 |
| ★ `isCurrentRecord` | boolean | 是否当前生效 |
| ★ `changeTypeOID` | string | 变动类型，枚举见下；等于 2 表示离职再入职 |
| `businessTypeOID` | string | 变动业务类型 |
| `changedStatus` | string | 变动后状态，枚举同人员状态 |
| `transitionTypeOID`、`changeReason` | string | 异动类型、变动原因 |
| `entryStatus` | string | 入职状态，0 正常，1 取消，2 延期 |
| `entryType` | string | 入职类型，枚举见下 |
| ★ `pOIdEmpAdmin` | integer | 直线经理 UserID |
| `pOIdEmpReserve2` | integer | 虚线经理 UserID |
| `isCharge` | string | 是否部门负责人，"0" 否，"1" 是 |
| `oIdJobPost`、`oIdJobSequence`、`oIdProfessionalLine`、`oIdJobPosition`、`oIdJobLevel`、`oidJobGrade` | string | 职务、职务序列、专业条线、职位、职级、职等的 OId，只有编号 |
| `place` | string | 工作地点 |
| `employmentSource`、`employmentForm`、`employmentType` | string | 人员来源、用工形式、人员类别的实体 GUID |
| `employmentChangeID` | string | 任职变更记录的实体 GUID |
| `order` | integer | 同一员工多条任职的排序号 |
| `lUOffer` | string | Offer 业务数据 GUID |
| `workYearBefore`、`workYearGroupBefore`、`workYearCompanyBefore`、`workYearTotal`、`workYearGroupTotal`、`workYearCompanyTotal` | float | 入职前与累计的工龄、集团工龄、司龄，累计值每天定时刷新，有延迟 |
| `whereabouts` | string | 离职后去向 |
| `handoverPerson` | integer | 离职交接人 UserID |
| `addOrNotBlackList`、`blackStaffDesc`、`addBlackExpireDate`、`blackListAddReason` | 混合 | 是否加入黑名单及说明、有效期、原因 |
| `dimension1` 到 `dimension5` | string | 预置编制维度 |
| `isContinuousContract`、`continuousContractStartDate`、`continuousContractWeeks` | 混合 | 连续性合约相关 |
| `workFlowProcessId` | string | 审批流程的实体 GUID |
| `remarks` | string | 备注 |
| `objectId` | string | 任职记录的主键 GUID |
| `customProperties`、`sysMartionProperties`、`translateProperties` | dictionary | 同员工信息 |
| `businessModifiedBy`、`businessModifiedTime`、`createdBy`、`createdTime`、`modifiedBy`、`modifiedTime`、`stdIsDeleted` | 混合 | 同员工信息 |

## 枚举值

| 字段 | 取值 |
| --- | --- |
| 人员状态 `empStatus`、`employeeStatus`、`changedStatus` | 1 待入职，2 试用，3 正式，4 调出，5 待调入，6 退休，8 离职，12 非正式。官方请求示例里还出现过 7（返聘），但枚举页没有 7，以枚举页为准 |
| 雇佣关系 `employType` | 0 内部员工，1 外部人员，2 实习生，3 顾问 |
| 任职类型 `serviceType` | 0 主职，1 兼职，4 借调，5 外派 |
| 审批状态 `approvalStatus` | 0 草稿，1 审批中，2 审批通过，3 审批未通过，4 生效，5 作废，6 已驳回（请求只能传 2 和 4） |
| 任职状态 `serviceStatus` | 0 任职中，1 任职结束 |
| 入职状态 `entryStatus` | 0 正常，1 取消，2 延期 |
| 入职类型 `entryType` | 1 新增入职，2 重聘入职，29 实习转正，30 新增外部人员，32 退休返聘，35 劳务转正式 |
| 变动业务类型 `businessTypeOID` | 1 入职，2 转正，3 调动，5 离职，6 退休，10 组织调整 |
| 变动类型 `changeTypeOID` | 1 新增入职，2 重聘入职，3 正常转正，4 延期试用，5 未通过，6 试用中，7 机构内调动，8 机构间调出，9 机构间调入，13 辞职，14 辞退，15 失踪，16 提前退休，17 正常退休，18 延迟退休，24 死亡，25 提前转正，28 实习结束，29 实习转正，30 新增外部人员，31 停用外部人员，32 退休返聘，33 返聘结束，40 劳务转正式 |

## 四类查询的参数

下面三类来自北森社区的官方取数方案（更新于 2026-06-25）和问答，审批中的一类来自接口文档。共同点：`timeWindowQueryType` 1、`serviceType` [0]、`isWithDeleted` false、`capacity` 100、`columns` null、`sort` 为 `{"CreatedTime": 1}`。

| 要查什么 | `empStatus` | `employType` | `approvalStatuses` | `isGetLatestRecord` | 备注 |
| --- | --- | --- | --- | --- | --- |
| 在职员工及当前生效的主职 | [2,3] | [0,2] | [4] | false | 不含待入职、离职；不含兼职和未来才生效的任职。外部员工要查，`employType` 加 1 |
| 已生效的离职 | [8] | [0,2] | [4] | false | 离职审批通过后要过了最后工作日，才算实际离职并出现在这里 |
| 待入职 | 在上面基础上 `empStatus` 加 1 | [0,2] | [4] | **true** | 待入职人员可能还没有生效的主职，用 false 会漏，所以要 true，取入职后即将生效的那条 |
| 已操作入职、入职日期在未来 | 至少含 2 和 3 | [0] 或 [0,2]，看这个人入职时的类型 | 含 4 | true | `serviceType` 必须是 [0]。适合在入职日之前提前开通门卡、账号 |
| 离职审批中 | 必填 | - | - | - | 时间窗接口查不到，要换接口 `GetListByBussinessType`，传 `empStatus`（必填）和 `businessTypes`（必填，5 为离职）。该接口每批最多 100 条，只查当前生效任职记录是审批中的数据，不含已删除的 |

几个会踩的地方：

- **未来离职会提前显示为离职。** 离职审批已通过、最后工作日在未来的员工，只要请求里 `approvalStatuses` 含 2 且 `isGetLatestRecord` 为 true，就会返回 `employeeStatus` 为 8 的记录。要只取已生效的离职，`approvalStatuses` 只传 [4]，`isGetLatestRecord` 传 false。
- **判断新入职还是重聘**，看当前主职任职记录的 `changeTypeOID`，等于 2 是重聘。
- **判断是否离职**，看任职记录的 `employeeStatus`：8 离职，2、3 在职，1 待入职。
- **漏数据的排查清单**：`employType`、`empStatus`、`isGetLatestRecord`、时间范围、`timeWindowQueryType`、`isWithDeleted`、`withDisabled`、没翻完页、`extQueries`、调用的租户与前台看的不是同一个租户。

## 与现有北森连接器的差异

> 2026-10-03 更新：下表的差异已在北森连接器 0.3.0 里处理（改用 `GetByTimeWindow`、嵌套响应、`T` 分隔的时间、89 天分段、状态范围预设、业务修改时间默认、点路径过滤）。部门仍只有 OId，官方方案用映射表把 OId 对到飞书部门 ID，没有依赖组织接口。下表保留作为改动前的对照。

对照对象是 `packages/connectors/community/beisen/src/lib`（版本 0.2.1）、`tools/e2e/main-line/` 的模拟服务和主线工作流。下面是逐项比对，没有改代码。

| 项 | 现有实现 | 官方文档 | 影响 |
| --- | --- | --- | --- |
| 接口路径 | `/TenantBasePublicApiV2/v2/employee/timewindow/search`（触发器和 `search-changed-employees` 动作都是） | `/TenantBaseExternal/api/v5/Employee/GetByTimeWindow` | 前者是否仍可用、返回什么形状，没有一手文档可查，需要真实租户验证 |
| 响应形状 | 模拟服务和主线工作流把记录当成平铺对象，读 `UserID`、`Name`、`MobilePhone`、`Email`、`EmployeeNumber`、`DepartmentName` | 嵌套：`employeeInfo.userID`、`employeeInfo.name`、`employeeInfo.mobilePhone`、`employeeInfo.email`、`recordInfo.jobNumber`，字段名小驼峰 | 如果切到官方接口，所有用平铺字段的映射都要改；`EmployeeNumber` 对应 `recordInfo.jobNumber` |
| 部门 | 平铺的 `DepartmentName` | 只有 `recordInfo.oIdDepartment`（整数 OId），没有名称 | 按部门开通飞书账号需要再查组织单元接口把 OId 换成名称和上下级，现有 `get-sub-organizations` 动作用的是 `/TenantBaseExternal/api/v5/Organization/GetSubOrganizations`，能否直接用要读该接口文档后确认 |
| 状态过滤 | 触发器的「Only When This Column」按顶层字段名取值（`record[name]`） | 状态在 `recordInfo.employeeStatus`，嵌套一层 | 要支持点路径，或先把嵌套结构拍平 |
| 请求入参 | 只传 `startTime`、`stopTime`、`capacity`、`isWithDeleted`、`scrollId`、`columns` | 另有 `timeWindowQueryType`、`empStatus`、`employType`、`serviceType`、`approvalStatuses`、`isGetLatestRecord`、`withDisabled` | 不传 `empStatus` 时官方默认不含离职，主线要停账号就必须显式传；不传 `timeWindowQueryType` 默认 1，会被每天凌晨的系统更新刷屏 |
| 时间格式 | 用瑞典语区域格式化，得到 `2026-10-03 12:00:00`（空格分隔） | 文档示例是 `2021-01-01T00:00:00`（`T` 分隔） | 接口是否两种都接受，文档没说，按文档用 `T` 最稳 |
| 窗口长度 | 触发器首次回看 24 小时，之后从上次时间起 | 跨度超过 90 天返回 417 | 工作流停用超过 90 天再启用时会整个失败，需要按 90 天切段补跑 |
| 翻页间隔 | 触发器先取完所有页再返回，每页之间没有业务处理 | 两次请求间隔不得超过 10 秒 | 符合要求；上限 `MAX_PAGES_PER_POLL` 为 100 页乘每页 100 条，超出部分当次不会取到，下次从当前时间起会丢 |
| 每页条数 | 触发器 100；动作默认 100，说明里写「Beisen caps this at 100」 | 默认 100，上限 300 | 说明文字与官方不符，只影响效率 |
| 示例数据 | `UserID` 是 GUID 字符串 | `userID` 是整数，GUID 的是 `objectId` 和 `staffID` | 示例会误导映射 |
| 去重 | 触发器用 `DedupeStrategy.TIMEBASED`，每条记录的时间都取 `stopTime`，窗口首尾相接 | 同一员工可能在多个时间窗里重复出现且内容相同 | 同一次修改只落在一个窗口，平台侧一般不会重复；但 `timeWindowQueryType` 为 1 时，系统任务每天凌晨改写修改时间，同一个没有业务变化的员工会每天触发一次 |

「超出 100 页丢数据」和「每天触发一次」是我读代码和文档得出的推断，没有在真实租户上验证。

## 还缺的

- **没有可用的北森测试租户。** 我只能读文档，不能调接口，所以官方接口的真实响应、`PublicApiV2` 路径是否仍可用、时间格式是否宽容、`oIdDepartment` 能否换出部门名，都没有验证。你说的只读测试租户，我这边提供不了，需要由北森实施顾问为你开通测试租户（见 [beisen-help-docs.md](beisen-help-docs.md) 的环境说明）。
- 组织单元接口（把 `oIdDepartment` 换成部门名和上下级）还没读。
- 接口文档站点上「员工与任职」下还有 40 多个接口（新建、更新、转正、离职、调动等），本页只覆盖时间窗查询和审批中查询。
