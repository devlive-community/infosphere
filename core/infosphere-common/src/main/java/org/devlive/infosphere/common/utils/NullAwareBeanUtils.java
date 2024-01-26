package org.devlive.infosphere.common.utils;

import org.springframework.beans.BeanUtils;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;

import java.beans.PropertyDescriptor;
import java.util.HashSet;
import java.util.Set;

public class NullAwareBeanUtils
{
    /**
     * 将目标源中不为空的字段过滤，将数据库中查出的数据源复制到提交的目标源中
     *
     * @param source 用id从数据库中查出来的数据源
     * @param target 提交的实体，目标源
     */
    public static void copyNullProperties(Object source, Object target)
    {
        BeanUtils.copyProperties(source, target, getNoNullProperties(target));
    }

    /**
     * @param target 目标源数据
     * @return 将目标源中不为空的字段取出
     */
    private static String[] getNoNullProperties(Object target)
    {
        BeanWrapper srcBean = new BeanWrapperImpl(target);
        PropertyDescriptor[] pds = srcBean.getPropertyDescriptors();
        Set<String> noEmptyName = new HashSet<>();
        for (PropertyDescriptor p : pds) {
            Object value = srcBean.getPropertyValue(p.getName());
            if (value != null) {
                noEmptyName.add(p.getName());
            }
        }
        String[] result = new String[noEmptyName.size()];
        return noEmptyName.toArray(result);
    }
}
