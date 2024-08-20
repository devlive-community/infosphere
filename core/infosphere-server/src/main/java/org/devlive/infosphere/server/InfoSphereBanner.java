package org.devlive.infosphere.server;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.Banner;
import org.springframework.core.env.Environment;

import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

@Slf4j
public class InfoSphereBanner
        implements Banner
{
    @Override
    public void printBanner(Environment environment, Class<?> sourceClass, PrintStream out)
    {
        String bannerPath = String.join(File.separator, environment.getProperty("spring.config.location"), "banner.txt");
        try (InputStreamReader reader = new InputStreamReader(Files.newInputStream(Paths.get(bannerPath)), StandardCharsets.UTF_8)) {
            int ch;
            while ((ch = reader.read()) != -1) {
                out.print(Character.toChars(ch));
            }
        }
        catch (IOException e) {
            log.warn("Banner file not found", e);
            log.info("Banner closed");
        }
    }
}
