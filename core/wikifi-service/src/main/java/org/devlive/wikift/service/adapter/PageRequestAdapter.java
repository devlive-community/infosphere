package org.devlive.wikift.service.adapter;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

public class PageRequestAdapter
{
    private PageRequestAdapter()
    {
    }

    public static PageRequest of(Integer start, Integer end)
    {
        if (start == null) {
            start = 0;
        }
        if (end == null) {
            end = 10;
        }
        if (start > 0) {
            start = start - 1;
        }
        return PageRequest.of(start, end);
    }

    public static PageRequest of(int start, int end, Sort sort)
    {
        if (start > 0) {
            start = start - 1;
        }
        return PageRequest.of(start, end, sort);
    }
}
