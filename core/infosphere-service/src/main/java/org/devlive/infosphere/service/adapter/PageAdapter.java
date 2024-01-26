package org.devlive.infosphere.service.adapter;

import com.google.common.collect.Maps;
import lombok.Data;
import org.springframework.data.domain.Page;

import java.util.List;
import java.util.Map;

@Data
public class PageAdapter<T>
{
    private Map<String, Object> page;
    private List<T> content;

    private PageAdapter()
    {
    }

    public static <T> PageAdapter<T> of(Page<T> page)
    {
        PageAdapter<T> instance = new PageAdapter<>();
        instance.setContent(page.getContent());

        Map<String, Object> pageInfo = Maps.newHashMap();
        pageInfo.put("page", page.getNumber() + 1);
        pageInfo.put("size", page.getSize());
        pageInfo.put("total", page.getTotalElements());
        pageInfo.put("totalPage", page.getTotalPages());
        instance.setPage(pageInfo);
        return instance;
    }
}
