package org.devlive.infosphere.service.converter;

import org.devlive.infosphere.common.utils.JsonUtils;
import org.devlive.infosphere.service.entity.FieldEntity;
import org.springframework.util.StringUtils;

import javax.persistence.AttributeConverter;

public class FieldConverter
        implements AttributeConverter<FieldEntity, String>
{
    @Override
    public String convertToDatabaseColumn(FieldEntity configure)
    {
        return JsonUtils.toJSON(configure);
    }

    @Override
    public FieldEntity convertToEntityAttribute(String json)
    {
        if (!StringUtils.hasLength(json)) {
            return null;
        }
        return JsonUtils.toObject(json, FieldEntity.class);
    }
}
