#!/bin/sh

HOME=$(pwd)
APPLICATION_NAME='org.devlive.infosphere.server.InfoSphere'
APPLICATION_PID=

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

job_runner_stop_server() {
    printf "\n\t服务运行状态检查 \n"
    printf "============================================\n"
    job_before_apply_server
    printf "服务运行进程                        | %s\n" "$APPLICATION_PID"
    if test -z "$APPLICATION_PID"; then
        printf "服务运行状态                        | %s\n" "stopped"
        printf "============================================\n\n"
        exit
    else
        printf "服务停止中                      | %s\n" "$APPLICATION_NAME"
        kill -9 "$APPLICATION_PID"
        rm -rf "$HOME/pid"
        printf "服务停止成功                        | %s\n"
        printf "============================================\n\n"
    fi
}

job_before_echo_basic
job_runner_stop_server
