package org.devlive.infosphere.service.adapter;

import lombok.Data;

@Data
public class PageFilterAdapter
{
    private Integer page;
    private Integer size;
    private Boolean visibility;
    private Boolean excludeUser = false;
}
