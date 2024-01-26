const HttpUtils = (function () {
    let headers = {};
    if (authToken) {
        headers = {
            'Authorization': authToken.type + ' ' + authToken.token
        }
    }

    // 设置默认的 Ajax 配置
    const defaultConfig = {
        dataType: 'json', // 预期服务器返回的数据类型
        contentType: 'application/json', // 发送到服务器的数据类型
        headers: headers
    };

    // 发送 GET 请求
    function get(url, successCallback, errorCallback) {
        return $.ajax({
            url: url,
            type: 'GET',
            success: successCallback,
            error: errorCallback,
            ...defaultConfig
        });
    }

    // 发送 POST 请求
    function post(url, data, successCallback, errorCallback) {
        return $.ajax({
            url: url,
            type: 'POST',
            data: JSON.stringify(data),
            success: successCallback,
            error: errorCallback,
            ...defaultConfig
        });
    }

    // 发送 PUT 请求
    function put(url, data, successCallback, errorCallback) {
        return $.ajax({
            url: url,
            type: 'PUT',
            data: JSON.stringify(data),
            success: successCallback,
            error: errorCallback,
            ...defaultConfig
        });
    }

    // 发送 DELETE 请求
    function del(url, successCallback, errorCallback) {
        return $.ajax({
            url: url,
            type: 'DELETE',
            success: successCallback,
            error: errorCallback,
            ...defaultConfig
        });
    }

    // 公共接口
    return {
        get: get,
        post: post,
        put: put,
        delete: del
    };
})();
