function UserEntity(id, username, password, conformPassword, avatar, aliasName, signature, email, active, lock) {
    this.id = id;
    this.username = username;
    this.password = password;
    this.conformPassword = conformPassword;
    this.avatar = avatar;
    this.aliasName = aliasName;
    this.signature = signature;
    this.email = email;
    this.active = active;
    this.lock = lock;
}

const UserEntityUtils = function () {

    const getUserByJson = function getUserByJson(json) {
        if (WikiftUtilsJson.isJson(json)) {
            const userInfo = new UserEntity();
            userInfo.id = json.id;
            userInfo.username = json.username;
            userInfo.avatar = json.avatar;
            userInfo.aliasName = json.aliasName;
            userInfo.signature = json.signature;
            userInfo.email = json.email;
            userInfo.active = json.active;
            userInfo.lock = json.lock;
            return userInfo;
        }
        return null;
    };

    return {
        getUserByJson: getUserByJson
    }

}();