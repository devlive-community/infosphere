#!/bin/sh

HOME=$(pwd)
JAVA_HOME=${JAVA_HOME:-/opt/jdk}
APPLICATION_NAME='org.devlive.infosphere.server.InfoSphere'
APPLICATION_PID=

check_java_version() {
    local java_version=$("$JAVA_HOME"/bin/java -version 2>&1 | awk -F '"' '/version/ {print $2}')
    local major_version=$(echo "$java_version" | awk -F. '{print $1}')
    if [ "$major_version" != "1" ] && [ "$major_version" != "11" ]; then
        printf "错误：不支持 Java 版本 [ %s ]。请使用 Java 1.8 或 11。\n" "$java_version"
        exit 1
    fi
}

job_before_echo_basic() {
    printf "\n\t运行环境详情\n"
    printf "============================================\n"
    printf "运行时 InfoSphere 主目录          | %s\n" "$HOME"
    printf "运行时 java 主目录                | %s\n" "$JAVA_HOME"
    printf "运行时应用程序名称                | %s\n" "$APPLICATION_NAME"
    printf "============================================\n\n"
}

job_before_apply_server() {
    APPLICATION_PID=$(pgrep -f "$APPLICATION_NAME" | awk '{print $1}')
}

job_runner_checker_server() {
    printf "\n\t服务运行状态检查 \n"
    printf "============================================\n"
    job_before_apply_server
    printf "服务运行进程                             | %s\n" "$APPLICATION_PID"
    if test -z "$APPLICATION_PID"; then
        printf "服务运行状态                             | %s\n" "已停止"
        printf "============================================\n\n"
    else
        printf "服务运行状态                             | %s\n" "运行中"
        printf "============================================\n\n"
        exit
    fi
}

job_runner_start_server() {
    printf "\n\t启动服务 \n"
    printf "============================================\n"
    printf "启动服务                             | %s\n" "$APPLICATION_NAME"
    cd "$HOME"
    nohup "$JAVA_HOME"/bin/java -cp "$HOME/lib/*" "$APPLICATION_NAME" \
                  --spring.config.location="$HOME/configure/"
    sleep 5
    job_before_apply_server
    if test -z "$APPLICATION_PID"; then
        printf "服务启动失败                        | %s\n"
    else
        echo "$APPLICATION_PID" >pid
        printf "服务启动成功                         | %s\n"
    fi
    printf "============================================\n\n"
}

check_java_version
job_before_echo_basic
# shellcheck disable=SC2119
job_runner_checker_server
job_runner_start_server
exit 0
