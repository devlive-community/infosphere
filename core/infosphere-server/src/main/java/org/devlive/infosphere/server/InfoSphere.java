package org.devlive.infosphere.server;

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
        @ComponentScan(value = "org.devlive.infosphere.security"),
        @ComponentScan(value = "org.devlive.infosphere.service")
})
public class InfoSphere
{
    public void start(String[] args)
    {
        SpringApplication application = new SpringApplication(InfoSphere.class);
        application.setBanner(new InfoSphereBanner());
        application.run(args);
    }

    public static void main(String[] args)
    {
        new InfoSphere()
                .start(args);
    }
}
