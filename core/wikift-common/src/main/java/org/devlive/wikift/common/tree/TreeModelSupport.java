package org.devlive.wikift.common.tree;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

import java.util.List;

@Data
@ToString
@NoArgsConstructor
@AllArgsConstructor
public class TreeModelSupport
{
    private Long id; // 数据唯一标志
    private String name; // 数据显示名称
    private String url; // 数据访问地址
    private Integer sorted; // 数据排序
    private Boolean newd; // 数据新旧标志
    private String icon; // 数据图标
    private Boolean checked = false; // 是否选中
    List<TreeModelSupport> children; // 子数据
    private Long item;
}
