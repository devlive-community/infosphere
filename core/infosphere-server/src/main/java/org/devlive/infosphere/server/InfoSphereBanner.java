package org.devlive.infosphere.server;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.Banner;
import org.springframework.core.env.Environment;

import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.io.PrintStream;

@Slf4j
public class InfoSphereBanner
        implements Banner
{
    @Override
    public void printBanner(Environment environment, Class<?> sourceClass, PrintStream out)
    {
        String banner = String.join(File.separator, environment.getProperty("spring.config.location"), "banner.txt");
        try (FileReader reader = new FileReader(banner)) {
            int ch;
            while ((ch = reader.read()) != -1) {
                out.print(ch);
            }
        }
        catch (IOException e) {
            log.warn("Banner file not found", e);
            log.info("Banner closed");
        }
    }
}
