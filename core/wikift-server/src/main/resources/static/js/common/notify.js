const CommonNotify = function () {
    /**
     * init properties
     * @returns {{}}
     */
    const initConfig = function (notify, config) {
        if (notify instanceof NotifyEntity) {
            const options = {};
            options.icon = notify.icon;
            options.title = notify.title;
            options.message = notify.message;
            options.type = config.type;
            // options.template = initTemplate(notify);
            return options;
        }
        throw Error('wikift notify config is error!');
    };
    const initNotify = function (notify, config) {
        if (config !== 'undefined' || config !== '' || config !== null) {
            config = initConfig(notify, config);
        }
        $.notify(notify, config);
    };

    /**
     * 初始化模板
     */
    const initTemplate = function (notify) {
        return '<div data-notify="container" class="alert alert-dismissible alert-{0} alert--notify" role="alert">' +
            '<span data-notify="icon"></span> ' +
            '<span data-notify="title">{notify.title}</span> ' +
            '<span data-notify="message">{notify.message}</span>' +
            '<div class="progress" data-notify="progressbar">' +
            '<div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;"></div>' +
            '</div>' +
            '<a href="{3}" target="{4}" data-notify="url"></a>' +
            '<button type="button" aria-hidden="true" data-notify="dismiss" class="alert--notify__close">Close</button>' +
            '</div>';
    };

    return {
        initNotify: initNotify
    }

}();