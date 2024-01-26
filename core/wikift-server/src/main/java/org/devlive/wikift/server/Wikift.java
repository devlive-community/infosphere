package org.devlive.wikift.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.ComponentScans;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableAsync
@EnableScheduling
@EnableJpaAuditing
@SpringBootApplication
@ComponentScans(value = {
        @ComponentScan(value = "org.devlive.wikift.security"),
        @ComponentScan(value = "org.devlive.wikift.service")
})
public class Wikift
{
    public void start(String[] args)
    {
        SpringApplication.run(Wikift.class, args);
    }

    public static void main(String[] args)
    {
        new Wikift().start(args);
    }
}
