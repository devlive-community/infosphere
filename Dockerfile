FROM eclipse-temurin:8-jdk-focal

MAINTAINER qianmoQ "community@devlive.org"

RUN mkdir -p /opt/app
ADD dist/infosphere-release.tar.gz /opt/app/
WORKDIR /opt/app/infosphere

EXPOSE 9099

# run it
ENTRYPOINT ["sh", "./bin/debug.sh"]
