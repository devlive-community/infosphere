const StorageUtils = (function () {
    // 存储数据
    function put(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    // 获取数据
    function get(key) {
        const storedValue = localStorage.getItem(key);
        return storedValue ? JSON.parse(storedValue) : null;
    }

    // 移除数据
    function remove(key) {
        localStorage.removeItem(key);
    }

    // 公共接口
    return {
        get: get,
        put: put,
        delete: remove
    };
})();
