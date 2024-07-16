package org.devlive.infosphere.common.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

@Data
@ToString
@NoArgsConstructor
@AllArgsConstructor
public class CommonResponse<T>
{
    private Integer code;
    private Boolean status;
    private Object message;
    private T data;

    public static <T> CommonResponse<T> success(T data)
    {
        CommonResponse<T> response = new CommonResponse<T>();
        response.code = 200;
        response.status = true;
        response.message = null;
        response.data = data;
        return response;
    }

    public static <T> CommonResponse<T> failure(String message)
    {
        CommonResponse<T> response = new CommonResponse<>();
        response.code = 401;
        response.status = false;
        response.message = message;
        response.data = null;
        return response;
    }

    public static <T> CommonResponse<T> unauthorized(String message)
    {
        CommonResponse<T> response = new CommonResponse<>();
        response.code = 400;
        response.status = false;
        response.message = message;
        response.data = null;
        return response;
    }
}
