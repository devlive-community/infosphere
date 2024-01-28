---
title: Docker Compose 部署
---

InfoSphere 项目提供 Docker Compose 方式部署，通过下载 [docker-compose.yml](https://github.com/devlive-community/incubator-infosphere/blob/dev/docker-compose.yml) 文件，或者使用以下代码进行服务部署。

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:latest
    environment:
      MYSQL_ROOT_PASSWORD: 12345678
      MYSQL_DATABASE: infosphere
    ports:
      - "3306:3306"
    volumes:
      - ./configure/initializer/infosphere.sql:/docker-entrypoint-initdb.d/schema.sql

  infosphere-app:
    image: devliveorg/infosphere:latest
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://mysql:3306/infosphere
      SPRING_DATASOURCE_USERNAME: root
      SPRING_DATASOURCE_PASSWORD: 12345678
    restart: always
    ports:
      - "9099:9099"
    depends_on:
      - mysql
    volumes:
      - ./configure/docker/application.properties:/opt/app/infosphere/configure/application.properties
```

!!! warning

    需要同时下载一下多个文件：

    - [infosphere.sql](https://github.com/devlive-community/incubator-infosphere/blob/dev/configure/initializer/infosphere.sql)
    - [application.properties](https://github.com/devlive-community/incubator-infosphere/blob/dev/configure/docker/application.properties)

    下载完成后将他们放置到指定目录，也就是 `./configure/docker/` 和 `./configure/initializer/` 如果需要自定义目录，可以修改 `docker-compose.yml` 文件中挂载的 `volumes` 配置即可。

## 启动服务

---

以上工作完成后，使用以下命令进行启动服务。**必须在包含 docker-compose.yml 文件的目录下执行**

```bash
docker-compose up
```

如果需要后台启动使用以下命令

```bash
docker-compose up -d
```

启动成功后，浏览器打开 http://localhost:9099/ 即可看到网站。

## 停止服务

---

停止服务需要使用以下命令

```bash
docker-compose down
```
