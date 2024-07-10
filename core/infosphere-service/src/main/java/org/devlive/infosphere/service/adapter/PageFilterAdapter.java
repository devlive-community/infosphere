package org.devlive.infosphere.service.adapter;

import lombok.Data;

@Data
public class PageFilterAdapter
{
    private Integer start;
    private Integer end;
    private Boolean visibility;
}
